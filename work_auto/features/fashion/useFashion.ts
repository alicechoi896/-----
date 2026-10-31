"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fashionApi, type FashionLoaded } from "./api";
import type { FashionProject, FashionSection } from "@/lib/fashion/types";

export type SaveState = "saved" | "saving" | "dirty" | "error";
const AUTOSAVE_MS = 1200;
const SYNC_MS = 8000;

/**
 * 패션 프로젝트 상태 + 자동 저장 (드라마 스튜디오 useProject 와 같은 방식).
 * - edit(section, value): 화면에 바로 반영하고 1.2초 뒤 그 부분만 저장
 * - 저장·서버 동작은 한 줄로 차례대로 (저장 전에 다른 동작이 먼저 가지 않게)
 * - 진행 중 Kie 작업·결과물이 있으면 8초마다 상태 확인 (무료)
 */
export function useFashion(id: string) {
  const [project, setProject] = useState<FashionProject | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(new Map<FashionSection, unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<FashionProject | null>(null);

  const apply = useCallback((r: FashionLoaded) => {
    const local = current.current;
    const next = { ...r.project } as FashionProject;
    if (local) for (const s of pending.current.keys()) (next as unknown as Record<string, unknown>)[s] = (local as unknown as Record<string, unknown>)[s];
    current.current = next;
    setProject(next);
    setUrls((u) => ({ ...u, ...r.urls }));
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      apply(await fashionApi.get(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [id, apply]);

  useEffect(() => {
    void (async () => load())();
  }, [load]);

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
            if (pending.current.get(section) === value) pending.current.delete(section);
            apply(await fashionApi.patch(id, section, value, keepalive));
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

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const job = chain.current.then(fn);
    chain.current = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }, []);

  const edit = useCallback(
    <K extends FashionSection>(section: K, value: FashionProject[K]) => {
      if (!current.current) return;
      const next = { ...current.current, [section]: value } as FashionProject;
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

  /** 서버 동작: 남은 저장부터 하고, 한 번에 하나만 */
  const run = useCallback(
    async <T extends FashionLoaded>(label: string, fn: () => Promise<T>): Promise<T | null> => {
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

  const active = Boolean(project?.tasks.some((t) => t.status === "generating" || t.status === "requesting") || project?.renders.some((r) => r.status === "running"));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        if (pending.current.size) return;
        const hasTasks = current.current?.tasks.some((x) => x.status === "generating" || x.status === "requesting");
        apply(await enqueue(() => (hasTasks ? fashionApi.sync(id) : fashionApi.get(id))));
      } catch {
        /* 다음에 다시 */
      }
    }, SYNC_MS);
    return () => clearInterval(t);
  }, [active, id, apply, enqueue]);

  return { project, urls, saveState, error, setError, busy, edit, flush, run, apply, enqueue, reload: load };
}
export type FashionCtl = ReturnType<typeof useFashion>;
