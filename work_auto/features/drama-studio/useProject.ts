"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { studioApi, type Loaded } from "./api";
import type { DramaProject, EditableSection, StepKey } from "@/lib/drama-studio/types";

export type SaveState = "saved" | "saving" | "dirty" | "error";
const AUTOSAVE_MS = 1200;
const SYNC_MS = 10_000;

/**
 * 프로젝트 상태 + 자동 저장 (v0.9.81).
 * - edit(section, value): 화면에 바로 반영하고 1.2초 뒤 그 부분만 저장 (여러 번 고치면 마지막 것만)
 * - 서버 응답이 와도 아직 저장하지 않은 부분은 화면 값을 유지한다
 * - 진행 중인 Kie 작업이 있으면 10초마다 상태 확인 (무료)
 * - 창을 닫을 때 남은 저장은 keepalive 로 보낸다
 */
export function useProject(id: string) {
  const [project, setProject] = useState<DramaProject | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(new Map<EditableSection, unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<DramaProject | null>(null);

  const apply = useCallback((r: Loaded) => {
    const local = current.current;
    const next = { ...r.project } as DramaProject;
    // 아직 저장하지 않은 부분은 화면 값을 유지
    if (local) for (const s of pending.current.keys()) (next as unknown as Record<string, unknown>)[s] = (local as unknown as Record<string, unknown>)[s];
    current.current = next;
    setProject(next);
    setUrls((u) => ({ ...u, ...r.urls }));
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      apply(await studioApi.get(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [id, apply]);

  useEffect(() => {
    void (async () => load())();
  }, [load]);

  // v0.9.84: 저장·서버 동작은 한 줄로 차례대로 — 자동 저장이 끝나기 전에 [승인]이 먼저 서버에 가서
  // '아이디어를 선택해 주세요'가 나오거나, 승인 저장이 방금 저장한 선택을 덮어쓰던 문제
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(
    (keepalive = false): Promise<void> => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const job = chain.current.then(async () => {
        const items = [...pending.current.entries()];
        if (!items.length) return;
        setSaveState("saving");
        try {
          for (const [section, value] of items) {
            // 보내는 동안 또 고쳤으면 다음 저장에서
            if (pending.current.get(section) === value) pending.current.delete(section);
            apply(await studioApi.patch(id, section, value, keepalive));
          }
          setSaveState(pending.current.size ? "dirty" : "saved");
        } catch (e) {
          for (const [s, v] of items) if (!pending.current.has(s)) pending.current.set(s, v);
          setSaveState("error");
          setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
        }
      });
      chain.current = job.catch(() => undefined);
      return job;
    },
    [id, apply],
  );

  /** 서버 동작도 저장과 같은 줄에 세운다 (앞 저장이 끝난 뒤 실행, 그동안 생긴 저장은 뒤로) */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const job = chain.current.then(fn);
    chain.current = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }, []);

  const edit = useCallback(
    <K extends EditableSection>(section: K, value: K extends keyof DramaProject ? DramaProject[K] : unknown) => {
      if (!current.current) return;
      const next = { ...current.current, [section]: value } as DramaProject;
      current.current = next;
      setProject(next);
      pending.current.set(section, value);
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onLeave = () => {
      if (pending.current.size) void flush(true);
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);

  /** 서버 동작 (생성·승인 등): 남은 저장부터 하고, 한 번에 하나만 */
  const run = useCallback(
    async <T extends Loaded>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      if (busy) return null;
      setBusy(label);
      setError(null);
      try {
        await flush();
        const r = await enqueue(fn);
        apply(r);
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy, flush, apply, enqueue],
  );

  // 진행 중 작업·렌더가 있으면 상태 확인
  const active = Boolean(project?.tasks.some((t) => t.status === "generating" || t.status === "requesting" || (t.status === "queued" && t.dependsOn)) || project?.renders.some((r) => r.status === "running"));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const hasTasks = current.current?.tasks.some((x) => x.status === "generating" || x.status === "requesting" || (x.status === "queued" && x.dependsOn));
        // 화면에서 고치는 중(저장 대기)이면 이번 확인은 건너뛴다
        if (pending.current.size) return;
        apply(await enqueue(() => (hasTasks ? studioApi.sync(id) : studioApi.get(id))));
      } catch {
        /* 다음에 다시 */
      }
    }, SYNC_MS);
    return () => clearInterval(t);
  }, [active, id, apply, enqueue]);

  const approve = useCallback((step: StepKey) => run("승인", () => studioApi.approve(id, step)), [id, run]);

  return { project, urls, saveState, error, setError, busy, edit, flush, run, approve, reload: load, apply, enqueue };
}
export type ProjectCtl = ReturnType<typeof useProject>;
