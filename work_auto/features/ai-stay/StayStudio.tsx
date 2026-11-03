"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, ImagePlus, Link2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import type { AiClip, VideoJob } from "@/lib/types/video-production";
import { AI_CLIP_CONFIG, STAY_MAX_PHOTOS } from "@/lib/video-production/config";

/**
 * AI 숙소 영상 (v0.9.157) — 사진 → AI 대본·움직임 → Kie 로 살아 움직이게 → 9:16 영상 (처음 몇 초 위쪽 제목 + 가운데 자막 + AI 내레이션)
 * 유료(Kie)는 확인 창 뒤에만, 상태 확인·사진 올리기는 무료
 */
interface Photo {
  key: string;
  line: string;
  motion: string;
}
interface Project {
  id: string;
  name: string;
  coupangUrl: string;
  note: string;
  titleSmall: string;
  titleBig: string;
  titleSec: number;
  photos: Photo[];
  clips: AiClip[];
  clipKeys: Record<string, string>;
  jobId: string | null;
  photoUrls: Record<string, string>;
  updatedAt: string;
}

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/stay" : `/api/stay${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

/** 큰 사진은 브라우저에서 줄여 보낸다 (긴 변 1600px JPEG) */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STATE: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  none: { label: "아직", tone: "neutral" },
  waiting: { label: "만드는 중", tone: "info" },
  generating: { label: "만드는 중", tone: "info" },
  success: { label: "완성", tone: "success" },
  fail: { label: "실패", tone: "danger" },
  draft: { label: "아직", tone: "neutral" },
};

export function StayStudio() {
  const [list, setList] = useState<{ id: string; name: string; updatedAt: string }[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [job, setJob] = useState<(VideoJob & { fileUrl?: string | null }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (id: string) => {
    setMsg(null);
    const proj = await call<Project>(undefined, id);
    setP(proj);
    setJob(proj.jobId ? await api.videoProduction.get(proj.jobId).catch(() => null) : null);
  }, []);
  const loadList = useCallback(async () => {
    try {
      const l = await call<Project[]>();
      setList(l.map((x) => ({ id: x.id, name: x.name, updatedAt: x.updatedAt })));
      if (l[0]) await open(l[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [open]);
  useEffect(() => {
    void (async () => loadList())();
  }, [loadList]);

  // Kie 상태 확인 (무료): 만드는 중인 컷이 있을 때만 8초마다
  const making = Boolean(p?.clips.some((c) => c.state === "waiting" || c.state === "generating"));
  useEffect(() => {
    if (!p || !making) return;
    const t = setInterval(() => void call<Project>({ action: "status", id: p.id }).then(setP).catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [p, making]);
  // 렌더 진행
  const rendering = Boolean(job && ["queued", "analyzing", "editing", "rendering", "quality_check"].includes(job.status));
  useEffect(() => {
    if (!job || !rendering) return;
    const t = setInterval(() => void api.videoProduction.get(job.id).then(setJob).catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [job, rendering]);

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
  const save = (patch: Partial<Project>) => p && run("save", async () => setP(await call<Project>({ action: "update", id: p.id, ...patch })));
  const clipOf = (key: string) => {
    const id = Object.entries(p?.clipKeys ?? {}).find(([, k]) => k === key)?.[0];
    return id ? p?.clips.find((c) => c.id === id) : undefined;
  };
  const todo = p ? p.photos.filter((ph) => !clipOf(ph.key) || clipOf(ph.key)!.state === "fail").length : 0;
  const usd = (todo * (AI_CLIP_CONFIG.product.credits ?? 20) * AI_CLIP_CONFIG.creditUsd).toFixed(2);
  const ready = p ? p.photos.filter((ph) => clipOf(ph.key)?.state === "success" && ph.line).length : 0;

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="숙소 영상을 불러오는 중…" />;

  return (
    <div className="space-y-5" data-stay>
      <div className="flex flex-wrap items-center gap-2">
        {list.length > 0 && (
          <Select className="w-64" value={p?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="숙소 영상 고르기" />
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          loading={busy === "create"}
          onClick={() =>
            void run("create", async () => {
              const np = await call<Project>({ action: "create", name: "새 숙소 영상" });
              setList((l) => [{ id: np.id, name: np.name, updatedAt: np.updatedAt }, ...(l ?? [])]);
              setP(np);
              setJob(null);
            })
          }
          data-stay-new
        >
          새 숙소 영상
        </Button>
        {p && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={() =>
              window.confirm(`'${p.name}'을(를) 지울까요? 올린 사진도 지워집니다.`) &&
              void run("remove", async () => {
                await call({ action: "remove", id: p.id });
                setP(null);
                await loadList();
              })
            }
          >
            지우기
          </Button>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={ImagePlus} title="숙소 영상이 없습니다" description="[새 숙소 영상]을 누르고 숙소 사진을 넣어 주세요." />
      ) : (
        <>
          <SectionCard title="① 숙소 사진" icon={ImagePlus} description={`사진 3~${STAY_MAX_PHOTOS}장 · 영상 컷 순서대로 (화살표로 순서 바꾸기). 사진은 9:16 으로 가운데를 꽉 채워 자릅니다. 쿠팡 주소는 한 번 시도하고, 막히면 사진을 저장해 올려 주세요.`} data-stay-photos>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && void save({ name: e.target.value })} placeholder="숙소 이름 (예: 가평 ○○ 글램핑)" aria-label="숙소 이름" />
              <div className="flex gap-1.5">
                <Input id="stay-coupang" defaultValue={p.coupangUrl} placeholder="쿠팡 숙소 주소 (선택)" aria-label="쿠팡 주소" />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Link2}
                  loading={busy === "coupang"}
                  onClick={() =>
                    void run("coupang", async () => {
                      const url = (document.getElementById("stay-coupang") as HTMLInputElement).value;
                      const r = await call<{ project: Project; added: number; blocked: boolean; status: number }>({ action: "coupang", id: p.id, url });
                      setP(r.project);
                      setMsg(r.added ? { tone: "info", text: `쿠팡에서 사진 ${r.added}장을 가져왔습니다. 안 쓸 사진은 지워 주세요.` } : { tone: "warning", text: r.blocked ? `쿠팡이 자동으로 읽는 것을 막았습니다 (HTTP ${r.status}). 사진을 저장해 [사진 올리기]로 넣어 주세요.` : "주소에서 사진을 찾지 못했습니다. 사진을 저장해 올려 주세요." });
                    })
                  }
                  data-stay-coupang
                >
                  사진 가져오기
                </Button>
              </div>
            </div>
            <Textarea className="mt-2" rows={2} defaultValue={p.note} onBlur={(e) => e.target.value !== p.note && void save({ note: e.target.value })} placeholder="사실 메모 (선택, 대본에 그대로 근거로 씀) — 예: 해발 300m, 개별 노천탕, 서울에서 1시간 반" aria-label="숙소 메모" />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])].slice(0, STAY_MAX_PHOTOS - p.photos.length);
                e.target.value = "";
                void run("upload", async () => {
                  let cur = p;
                  for (const f of files) cur = await call<Project>({ action: "upload", id: p.id, dataUrl: await shrink(f) });
                  setP(cur);
                });
              }}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" variant="primary" icon={ImagePlus} loading={busy === "upload"} disabled={p.photos.length >= STAY_MAX_PHOTOS} onClick={() => fileRef.current?.click()} data-stay-upload>
                사진 올리기 ({p.photos.length}/{STAY_MAX_PHOTOS})
              </Button>
            </div>
            {p.photos.length > 0 && (
              <ol className="mt-3 space-y-2" data-stay-list>
                {p.photos.map((ph, i) => {
                  const c = clipOf(ph.key);
                  const st = STATE[c?.state ?? "none"];
                  const move = (d: number) => {
                    const arr = [...p.photos];
                    const [x] = arr.splice(i, 1);
                    arr.splice(Math.max(0, Math.min(arr.length, i + d)), 0, x);
                    void save({ photos: arr });
                  };
                  return (
                    <li key={ph.key} className="grid grid-cols-[24px_64px_1fr_auto] items-start gap-2 rounded-control border border-line p-2" data-stay-photo>
                      <span className="pt-1 text-center text-[12px] font-semibold text-fg-subtle">{i + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photoUrls[ph.key]} alt="" className="aspect-[9/16] w-16 rounded object-cover" />
                      <div className="min-w-0 space-y-1">
                        <Input defaultValue={ph.line} onBlur={(e) => e.target.value !== ph.line && void save({ photos: p.photos.map((x) => (x.key === ph.key ? { ...x, line: e.target.value } : x)) })} placeholder="이 컷 자막·내레이션 (예: 돌 노천탕이)" className="h-8 text-[13px]" aria-label={`${i + 1}번 대사`} />
                        <Input defaultValue={ph.motion} onBlur={(e) => e.target.value !== ph.motion && void save({ photos: p.photos.map((x) => (x.key === ph.key ? { ...x, motion: e.target.value } : x)) })} placeholder="움직임 (영어, 예: steam rising, light rain)" className="h-7 text-[12px]" aria-label={`${i + 1}번 움직임`} />
                        <span className="flex items-center gap-1.5 text-[11.5px]">
                          AI 움직임 <Badge tone={st.tone}>{st.label}</Badge>
                          {c?.error && <span className="truncate text-danger">{c.error}</span>}
                        </span>
                      </div>
                      <span className="flex flex-col gap-1">
                        <button type="button" onClick={() => move(-1)} disabled={i === 0} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="위로">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" onClick={() => move(1)} disabled={i === p.photos.length - 1} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="아래로">
                          <ArrowDown className="size-4" />
                        </button>
                        <button type="button" onClick={() => window.confirm("이 사진을 뺄까요?") && void save({ photos: p.photos.filter((x) => x.key !== ph.key) })} className="text-fg-subtle hover:text-danger" aria-label="빼기">
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="② 제목·대사 (AI)" icon={Wand2} description="AI 가 사진을 보고 위쪽 제목 2줄과 컷마다 짧은 대사·움직임을 씁니다 (누를 때 AI 1번). 위 칸에서 바로 고칠 수 있습니다." data-stay-script>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={Sparkles} loading={busy === "script"} disabled={p.photos.length < 3} onClick={() => void run("script", async () => setP(await call<Project>({ action: "script", id: p.id })))} data-stay-script-go>
                제목·대사 만들기
              </Button>
              <span className="text-[12px] text-fg-subtle">사진 {p.photos.length}장 · 약 {Math.round(p.photos.length * 1.5)}초 영상</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
              <Input key={`s${p.updatedAt}`} defaultValue={p.titleSmall} onBlur={(e) => e.target.value !== p.titleSmall && void save({ titleSmall: e.target.value })} placeholder="위쪽 작은 줄 (예: 비 오는 날)" aria-label="제목 작은 줄" />
              <Input key={`b${p.updatedAt}`} defaultValue={p.titleBig} onBlur={(e) => e.target.value !== p.titleBig && void save({ titleBig: e.target.value })} placeholder="위쪽 큰 줄 (예: 액자창 앞 히노끼탕)" aria-label="제목 큰 줄" />
              <Select value={String(p.titleSec)} onChange={(e) => void save({ titleSec: Number(e.target.value) })} options={[1.5, 2, 2.5, 3, 4].map((v) => ({ value: String(v), label: `처음 ${v}초만` }))} aria-label="제목 보이는 시간" />
            </div>
          </SectionCard>

          <SectionCard title="③ 살아 움직이게 (AI 영상, 유료)" icon={Film} description={`사진마다 Kie AI 로 짧은 움직임 영상을 만듭니다 — 카메라는 그대로, 김·비·물결·불빛만 움직입니다. 사진 1장 = 1회 과금 (약 $${((AI_CLIP_CONFIG.product.credits ?? 20) * AI_CLIP_CONFIG.creditUsd).toFixed(2)}), 이미 만든 사진은 다시 만들지 않습니다.`} data-stay-animate>
            <Button
              variant="primary"
              icon={Film}
              loading={busy === "animate"}
              disabled={!todo || making}
              onClick={() =>
                window.confirm(`사진 ${todo}장을 AI 영상으로 만들까요?\n예상 비용 약 $${usd} (Kie 크레딧). 한 번 누르면 바로 과금됩니다.`) &&
                void run("animate", async () => {
                  const r = await call<{ project: Project; created: number }>({ action: "animate", id: p.id, confirmed: true });
                  setP(r.project);
                  setMsg({ tone: "info", text: `${r.created}장 만들기를 시작했습니다. 1~3분 뒤 '완성'으로 바뀝니다 (자동 확인, 무료).` });
                })
              }
              data-stay-animate-go
            >
              {making ? "만드는 중… (자동 확인)" : todo ? `${todo}장 살아 움직이게 · 약 $${usd}` : "모두 만들었습니다"}
            </Button>
          </SectionCard>

          <SectionCard title="④ 영상 만들기" icon={Film} description="완성된 AI 컷을 대사 순서대로 이어 붙이고, 처음 몇 초 위쪽 제목 + 가운데 자막 + AI 내레이션을 넣습니다 (목소리는 원고로 영상 만들기에서 마지막으로 쓴 설정, 음악 없음)." data-stay-render>
            <Button
              variant="primary"
              icon={Film}
              loading={busy === "render" || rendering}
              disabled={!ready || making}
              onClick={() => void run("render", async () => setJob(await call<VideoJob>({ action: "render", id: p.id })))}
              data-stay-render-go
            >
              {rendering ? "영상 만드는 중…" : `영상 만들기 (컷 ${ready}개)`}
            </Button>
            {job?.status === "failed" && <Notice tone="warning" className="mt-2">{job.error ?? "영상을 만들지 못했습니다."}</Notice>}
            {job?.fileUrl && !rendering && (
              <div className="mt-3 space-y-2">
                <video src={job.fileUrl} controls playsInline className="max-h-[70vh] rounded bg-black" data-stay-video />
                <a href={`/youtube/video-production?jobId=${job.id}`} className="text-[12.5px] text-brand hover:underline">
                  원고로 영상 만들기에서 열어 다운로드·유튜브 올리기
                </a>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
