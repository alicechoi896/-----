"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, Link2, ScanSearch, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, CopyButton, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select } from "@/components/ui";
import type { ScriptFormat } from "@/lib/types/script-format";

/**
 * 릴스 읽기 (v0.9.175) — ① 영상 올리기(무료) / 인스타 주소(TikHub 1회, 확인 후) → ② [읽기] 받아쓰기 + 장면 사진 + AI 1번
 * → 요약 3줄 · 장면별(시간/화면/말) · 첫 3초 · 구조 · 아이디어 3개 → [대본 포맷에 담기]
 */
interface Scene {
  t: number;
  frameKey: string;
  screen: string;
  speech: string;
}
interface Reel {
  id: string;
  name: string;
  url: string | null;
  videoKey: string | null;
  duration: number | null;
  transcript: { t: number; end: number; text: string }[];
  summary: string[];
  scenes: Scene[];
  first3s: string;
  structure: { hook: string; body: string; cta: string };
  ideas: string[];
  field: string;
  state: string;
  error: string | null;
  urls: Record<string, string>;
}

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/reel-read" : `/api/reel-read${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

export function ReelRead() {
  const [list, setList] = useState<{ id: string; name: string; state: string }[] | null>(null);
  const [r, setR] = useState<Reel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [url, setUrl] = useState("");
  const [field, setField] = useState("");
  const [formats, setFormats] = useState<ScriptFormat[]>([]);
  const [fmt, setFmt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (id: string) => setR(await call<Reel>(undefined, id)), []);
  const loadList = useCallback(async () => {
    try {
      const l = await call<{ id: string; name: string; state: string }[]>();
      setList(l);
      if (l[0]) await open(l[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [open]);
  useEffect(() => {
    void (async () => loadList())();
    void api.scriptFormats
      .list()
      .then(setFormats)
      .catch(() => setFormats([]));
  }, [loadList]);

  async function run(label: string, f: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({ tone: "warning", text: e instanceof Error ? e.message : "하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }
  const added = (x: Reel) => {
    setList((l) => [{ id: x.id, name: x.name, state: x.state }, ...(l ?? []).filter((y) => y.id !== x.id)]);
    setR(x);
  };
  const read = (id: string) => run("read", async () => added(await call<Reel>({ action: "read", id, field })));

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="불러오는 중…" />;

  return (
    <div className="space-y-5" data-reel>
      <SectionCard title="① 릴스 넣기" icon={ScanSearch} description="영상 파일을 올리면 무료입니다. 인스타그램 주소를 넣으면 TikHub 로 1번 받습니다 (유료, 누를 때만). 남의 릴스는 공부용으로만 — 영상·대본을 그대로 다시 올리지 마세요.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Upload} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-reel-upload>
            영상 올리기 (무료)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void run("upload", async () => {
                const up = await call<{ id: string; url: string; method: "PUT" | "POST" }>({ action: "upload-url", name: file.name, size: file.size });
                const res = await fetch(up.url, { method: up.method, body: file, headers: { "Content-Type": file.type || "video/mp4" } });
                if (!res.ok) throw new Error(`영상을 올리지 못했습니다 (HTTP ${res.status}).`);
                const x = await call<Reel>({ action: "read", id: up.id, field });
                added(x);
              });
            }}
          />
          <span className="text-[12px] text-fg-subtle">또는</span>
          <Input className="h-9 w-80" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" aria-label="릴스 주소" />
          <Button
            variant="secondary"
            icon={Link2}
            loading={busy === "url"}
            disabled={!url.trim()}
            onClick={() =>
              window.confirm("TikHub 로 이 릴스를 받을까요? (TikHub 1회 호출, 유료)\n받은 뒤 바로 읽습니다 (받아쓰기 OpenAI 1분 약 $0.006 + AI 1번).") &&
              void run("url", async () => {
                const x = await call<Reel>({ action: "url", url: url.trim(), confirmed: true });
                added(x);
                setUrl("");
                added(await call<Reel>({ action: "read", id: x.id, field }));
              })
            }
            data-reel-url
          >
            주소로 받기 (TikHub 1회)
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input className="h-9 w-80" value={field} onChange={(e) => setField(e.target.value)} placeholder="내 분야 (선택, 예: 가전 제품 홍보 쇼츠, 숙소 소개 릴스)" aria-label="내 분야" />
          {list.length > 0 && <Select className="w-64" value={r?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="읽은 릴스" />}
          {r && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`'${r.name}'을(를) 지울까요?`) && void run("remove", async () => (await call({ action: "remove", id: r.id }), setR(null), await loadList()))}>
              지우기
            </Button>
          )}
        </div>
      </SectionCard>
      {busy === "upload" || busy === "url" || busy === "read" ? <Notice tone="info">영상을 받고 장면 사진·받아쓰기·분석을 하는 중입니다 (30초~1분).</Notice> : null}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!r ? (
        <EmptyState icon={ScanSearch} title="읽은 릴스가 없습니다" description="영상을 올리거나 릴스 주소를 넣어 주세요." />
      ) : r.state !== "read" ? (
        <SectionCard title={r.name}>
          <p className="text-[13px] text-fg-muted">아직 읽지 않았습니다.</p>
          <Button className="mt-2" variant="primary" icon={ScanSearch} loading={busy === "read"} onClick={() => void read(r.id)}>
            읽기
          </Button>
        </SectionCard>
      ) : (
        <>
          {r.error && <Notice tone="warning">{r.error}</Notice>}
          <SectionCard title={`${r.name} · ${r.duration ?? "?"}초 · 장면 ${r.scenes.length}개`} icon={ScanSearch} actions={<Button size="sm" variant="ghost" loading={busy === "read"} onClick={() => void read(r.id)}>다시 읽기</Button>} data-reel-result>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <div>
                  <p className="text-[12.5px] font-semibold">원본 요약</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px]">
                    {r.summary.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-control border border-brand-line bg-brand-soft/30 p-2.5 text-[13px]">
                  <p className="font-semibold">첫 3초</p>
                  <p className="mt-0.5">{r.first3s}</p>
                </div>
                <div className="grid gap-1.5 text-[13px]">
                  {(
                    [
                      ["Hook (첫 3초)", r.structure.hook],
                      ["전개", r.structure.body],
                      ["CTA (마지막)", r.structure.cta],
                    ] as const
                  ).map(([k, v]) => (
                    <p key={k}>
                      <span className="mr-1.5 inline-block w-24 text-[12px] font-semibold text-fg-muted">{k}</span>
                      {v}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold">내 분야에 바꿔 쓸 아이디어</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[13px]">
                    {r.ideas.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="space-y-2">
                {r.videoKey && r.urls[r.videoKey] && <video src={r.urls[r.videoKey]} controls playsInline className="max-h-[420px] rounded bg-black" />}
                <div className="flex flex-wrap items-center gap-2 rounded-control border border-line p-2.5" data-reel-format>
                  <span className="text-[12.5px] font-semibold">대본 포맷에 담기</span>
                  <Select className="w-56" value={fmt} placeholder="새 포맷 만들기" onChange={(e) => setFmt(e.target.value)} options={[{ value: "", label: "새 포맷 만들기" }, ...formats.map((f) => ({ value: f.id, label: f.name }))]} aria-label="대본 포맷" />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={BookmarkPlus}
                    loading={busy === "format"}
                    disabled={!r.transcript.length}
                    onClick={() =>
                      void run("format", async () => {
                        const x = await call<{ format: { id: string; name: string } }>({ action: "format", id: r.id, formatId: fmt || undefined });
                        setMsg({ tone: "info", text: `'${x.format.name}' 대본 포맷에 받아쓴 대본(참고 대본)과 첫 3초 말(Hook)을 담았습니다.` });
                        void api.scriptFormats.list().then(setFormats).catch(() => undefined);
                      })
                    }
                  >
                    담기
                  </Button>
                  <span className="w-full text-[11.5px] text-fg-subtle">받아쓴 말 전체 = 참고 대본, 첫 3초 말 = Hook. AI 학습 관리 › 대본 포맷에서 고칠 수 있습니다.</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="장면별 (시간 / 화면 / 말)" icon={ScanSearch} actions={<CopyButton value={r.scenes.map((s) => `${s.t.toFixed(1)}초 | ${s.screen} | ${s.speech}`).join("\n")} />} data-reel-scenes>
            <ol className="space-y-2">
              {r.scenes.map((s, i) => (
                <li key={s.frameKey} className="grid grid-cols-[64px_1fr] items-start gap-3 rounded-control border border-line p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.urls[s.frameKey] ? <img src={r.urls[s.frameKey]} alt={`${i + 1}번 장면`} className="aspect-[9/16] w-16 rounded object-cover" /> : <span className="aspect-[9/16] w-16 rounded bg-muted" />}
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[12px] font-semibold text-brand">{s.t.toFixed(1)}초</p>
                    <p>{s.screen}</p>
                    {s.speech && <p className="mt-0.5 text-fg-muted">“{s.speech}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        </>
      )}
    </div>
  );
}
