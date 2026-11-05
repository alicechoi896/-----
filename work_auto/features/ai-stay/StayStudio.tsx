"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BedDouble, Film, ImagePlus, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import type { AiClip, VideoJob } from "@/lib/types/video-production";
import type { VideoProductionOptions } from "@/lib/api-client";
import { AI_CLIP_CONFIG, DEFAULT_VOICE_SPEED, STAY_ANGLE_CREDITS, STAY_ANGLES, STAY_CUT_MAX_SEC, STAY_MAX_PHOTOS, VOICE_SPEEDS } from "@/lib/video-production/config";
import { TypecastVoicePicker } from "@/features/video-production/VideoProductionWorkspace";
import { LinkButton } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/** v0.9.169 컷 시간 고르기: 자동 또는 1~5초. v0.9.171 영상과 대사는 따로 흐른다 (대사가 길면 자동 컷부터 늘림) */
const SEC_OPTIONS = [{ value: "", label: "자동 (1.6초~)" }, ...[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].filter((v) => v <= STAY_CUT_MAX_SEC).map((v) => ({ value: String(v), label: `${v}초` }))];

/**
 * AI 숙소 영상 (v0.9.157) — 사진 → AI 대본·움직임 → Kie 로 살아 움직이게 → 9:16 영상 (처음 몇 초 위쪽 제목 + 가운데 자막 + AI 내레이션)
 * 유료(Kie)는 확인 창 뒤에만, 상태 확인·사진 올리기는 무료
 */
interface Photo {
  key: string;
  line: string;
  motion: string;
  /** v0.9.169 움직임 명령어 한글 번역 (보기용) */
  motionKo?: string;
  /** v0.9.169 컷 보이는 시간(초), 없으면 대사 길이만큼 */
  sec?: number | null;
  /** v0.9.174 다른 사진에서 만든 각도 */
  fromKey?: string | null;
  angle?: string | null;
}
interface AngleTask {
  id: string;
  sourceKey: string;
  angle: string;
  state: "waiting" | "success" | "fail";
  error: string | null;
  createdAt?: string;
}
interface StayVoice {
  ttsEngine: "openai" | "typecast";
  voice: string;
  ttsEmotion?: string;
  voiceStyle?: string;
  voiceSpeed?: number;
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
  /** v0.9.159 가져온 제품 라이브러리 숙소 */
  productId?: string | null;
  angleTasks?: AngleTask[];
  jobId: string | null;
  photoUrls: Record<string, string>;
  /** v0.9.182 완성된 AI 컷 미리보기 (컷 id → 주소) */
  clipUrls?: Record<string, string>;
  /** v0.9.182 이 영상 목소리 (없으면 원고로 영상 만들기 마지막 설정) */
  voice?: StayVoice | null;
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
  // v0.9.159 제품 라이브러리의 숙소 (분류 '숙소')
  const [stays, setStays] = useState<{ id: string; name: string }[] | null>(null);
  const [stayPick, setStayPick] = useState("");
  // v0.9.182 다른 각도 만들기: 장소(원본 사진)마다 펼쳐서 각도 고르기
  const [angleOpen, setAngleOpen] = useState<string | null>(null);
  const [angleKinds, setAngleKinds] = useState<Set<string>>(new Set(["wide", "low", "close"]));
  useEffect(() => {
    void api.products
      .list()
      .then((l) => setStays(l.filter((x) => x.productGroup === "stay").map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setStays([]));
  }, []);

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
  const making = Boolean(p?.clips.some((c) => c.state === "waiting" || c.state === "generating") || p?.angleTasks?.some((t) => t.state === "waiting"));
  useEffect(() => {
    if (!p || !making) return;
    const t = setInterval(() => void call<Project>({ action: "status", id: p.id }).then(setP).catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [p, making]);
  // v0.9.182 예전에 완성된 AI 컷은 미리보기 파일이 없으니, 열 때 한 번만 받아 둔다 (무료 상태 확인)
  const pid = p?.id;
  const needPreview = Boolean(p?.clips.some((c) => c.state === "success" && !p.clipUrls?.[c.id]));
  useEffect(() => {
    if (!pid || !needPreview) return;
    void call<Project>({ action: "status", id: pid }).then(setP).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 프로젝트를 열 때 한 번만
  }, [pid]);
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
  const create = (productId: string) =>
    run("create", async () => {
      const pick = stays?.find((x) => x.id === productId);
      let np = await call<Project>({ action: "create", name: pick?.name ?? "새 숙소 영상" });
      let added = 0;
      if (pick) {
        const r = await call<{ project: Project; added: number; found: number }>({ action: "product", id: np.id, productId: pick.id });
        np = r.project;
        added = r.added;
      }
      setList((l) => [{ id: np.id, name: np.name, updatedAt: np.updatedAt }, ...(l ?? [])]);
      setP(np);
      setJob(null);
      if (pick) setMsg({ tone: added ? "info" : "warning", text: added ? `'${pick.name}' 사진 ${added}장과 숙소 정보로 새 영상을 만들었습니다. 사진마다 [다른 각도 만들기]로 컷을 늘려 보세요.` : `'${pick.name}'에 사진이 없습니다. 제품 라이브러리 › ${pick.name} › 내 사진에 숙소 사진을 올린 뒤 [사진 다시 가져오기]를 눌러 주세요.` });
    });
  const save = (patch: Partial<Project>) => p && run("save", async () => setP(await call<Project>({ action: "update", id: p.id, ...patch })));
  const clipOf = (key: string) => {
    const id = Object.entries(p?.clipKeys ?? {}).find(([, k]) => k === key)?.[0];
    return id ? p?.clips.find((c) => c.id === id) : undefined;
  };
  // v0.9.182 같은 장소 묶음: 원본 사진 + 그 사진으로 만든 각도 사진들 (원본을 뺀 각도는 따로 한 장소)
  const keys = new Set(p?.photos.map((x) => x.key) ?? []);
  const groups: { root: Photo; children: Photo[] }[] = [];
  for (const ph of p?.photos ?? []) {
    const g = ph.fromKey && keys.has(ph.fromKey) ? groups.find((x) => x.root.key === ph.fromKey) : undefined;
    if (g) g.children.push(ph);
    else groups.push({ root: ph, children: [] });
  }
  const cutNo = new Map(groups.flatMap((g) => [g.root, ...g.children]).map((ph, i) => [ph.key, i + 1]));
  const done = p ? p.photos.filter((ph) => clipOf(ph.key)?.state === "success").length : 0;
  const lined = p ? p.photos.filter((ph) => ph.line.trim()).length : 0;
  const angled = p ? p.photos.filter((ph) => ph.fromKey).length : 0;
  /** 컷 한 줄: 사진(완성되면 AI 영상) + 대사·움직임·컷 시간 */
  const cutRow = (ph: Photo, kind: string, child: boolean, onRemove: () => void) => {
    if (!p) return null;
    const n = cutNo.get(ph.key) ?? 0;
    const c = clipOf(ph.key);
    const st = STATE[c?.state ?? "none"];
    const vid = c?.state === "success" ? p.clipUrls?.[c.id] : undefined;
    const set = (patch: Partial<Photo>) => void save({ photos: p.photos.map((x) => (x.key === ph.key ? { ...x, ...patch } : x)) });
    return (
      <div key={ph.key} className={cn("grid grid-cols-[88px_1fr_auto] items-start gap-2.5 rounded-control border p-2", child ? "ml-6 border-brand-line/60 bg-brand-soft/10" : "border-line")} data-stay-photo>
        <div className="relative">
          {vid ? (
            <video src={vid} poster={p.photoUrls[ph.key]} muted loop playsInline autoPlay controls className="aspect-[9/16] w-[88px] rounded bg-black object-cover" data-stay-clip-video />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrls[ph.key]} alt="" className="aspect-[9/16] w-[88px] rounded object-cover" />
          )}
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">컷 {n}</span>
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <Badge tone={child ? "info" : "neutral"}>{kind}</Badge>
            <span className="text-fg-subtle">AI 영상</span>
            <Badge tone={st.tone}>{vid ? "완성 · 재생 중" : st.label}</Badge>
            {c?.error && <span className="truncate text-danger">{c.error}</span>}
          </div>
          <Input defaultValue={ph.line} onBlur={(e) => e.target.value !== ph.line && set({ line: e.target.value })} placeholder="이 컷 자막·내레이션 (예: 돌 노천탕이)" className="h-8 text-[13px]" aria-label={`${n}번 대사`} />
          <Input defaultValue={ph.motion} onBlur={(e) => e.target.value !== ph.motion && set({ motion: e.target.value })} placeholder="움직임 (영어, 예: steam rising, light rain)" className="h-7 text-[12px]" aria-label={`${n}번 움직임`} />
          <p className="text-[11.5px] leading-snug text-fg-muted" data-stay-motion-ko>
            <span className="mr-1 font-medium text-fg-subtle">한글</span>
            {ph.motionKo || (ph.motion ? "아직 번역 없음 — ②의 [움직임 한글 번역]을 눌러 주세요" : "—")}
          </p>
          <label className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle" data-stay-sec>
            컷 시간
            <select value={ph.sec ? String(ph.sec) : ""} onChange={(e) => set({ sec: e.target.value ? Number(e.target.value) : null })} className="h-7 rounded-control border border-line bg-canvas px-1.5 text-[12px] text-fg" aria-label={`${n}번 컷 시간`}>
              {SEC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" onClick={onRemove} className="text-fg-subtle hover:text-danger" aria-label="빼기">
          <Trash2 className="size-4" />
        </button>
      </div>
    );
  };
  const steps = p
    ? [
        { n: 1, label: "사진 넣기", sub: `${groups.length}곳 · ${p.photos.length}컷`, ok: p.photos.length >= 3 },
        { n: 2, label: "다른 각도 (선택)", sub: angled ? `각도 ${angled}컷` : "장소마다 컷 늘리기", ok: angled > 0 },
        { n: 3, label: "제목·대사", sub: `${lined}/${p.photos.length}컷`, ok: Boolean(p.photos.length && lined === p.photos.length && p.titleBig) },
        { n: 4, label: "살아 움직이게", sub: `${done}/${p.photos.length}컷 완성`, ok: Boolean(p.photos.length && done === p.photos.length) },
        { n: 5, label: "영상 만들기", sub: job?.status === "completed" || job?.status === "needs_review" ? "완성" : "목소리 고르고 만들기", ok: Boolean(job?.fileUrl) },
      ]
    : [];
  const linked = p?.productId ? (stays?.find((x) => x.id === p.productId) ?? { id: p.productId, name: p.name }) : null;
  const todo = p ? p.photos.filter((ph) => !clipOf(ph.key) || clipOf(ph.key)!.state === "fail").length : 0;
  const usd = (todo * (AI_CLIP_CONFIG.product.credits ?? 20) * AI_CLIP_CONFIG.creditUsd).toFixed(2);
  const ready = p ? p.photos.filter((ph) => clipOf(ph.key)?.state === "success" && ph.line).length : 0;

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="숙소 영상을 불러오는 중…" />;

  return (
    <div className="space-y-5" data-stay>
      {/* v0.9.174 숙소도 제품: 제품 라이브러리 숙소를 골라 시작 (항상 보이게) */}
      <SectionCard title="숙소 고르기" icon={BedDouble} description="제품 라이브러리에서 분류가 '숙소'인 제품을 고르면 그 숙소의 내 사진·이름·특징으로 새 영상을 만듭니다." data-stay-start>
        {stays && stays.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-72" value={stayPick} placeholder="숙소 고르기" onChange={(e) => setStayPick(e.target.value)} options={stays.map((x) => ({ value: x.id, label: x.name }))} aria-label="제품 라이브러리 숙소" data-stay-pick />
            <Button variant="primary" icon={Plus} loading={busy === "create"} disabled={!stayPick} onClick={() => void create(stayPick)} data-stay-new>
              이 숙소로 새 영상
            </Button>
            <LinkButton href="/tools/product-library" variant="ghost" size="sm">
              제품 라이브러리
            </LinkButton>
          </div>
        ) : (
          <div className="rounded-control border border-dashed border-line p-3 text-[12.5px]" data-stay-empty>
            <p className="font-semibold">제품 라이브러리에 숙소가 아직 없습니다.</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-fg-muted">
              <li>
                <b>제품 상세페이지 학습</b>에서 숙소 상품 주소로 학습하고, 저장할 때 <b>분류 = 숙소</b>를 고릅니다 (이미 저장했으면 제품 상세 위쪽 분류를 숙소로).
              </li>
              <li>
                제품 상세의 <b>내 사진</b>에 숙소 사진을 올립니다 (순서대로 컷이 됩니다).
              </li>
              <li>여기로 돌아오면 숙소를 골라 바로 영상을 만들 수 있습니다.</li>
            </ol>
            <div className="mt-2 flex flex-wrap gap-2">
              <LinkButton href="/tools/product-learning" size="sm" variant="secondary">
                제품 상세페이지 학습
              </LinkButton>
              <LinkButton href="/tools/product-library" size="sm" variant="secondary">
                제품 라이브러리
              </LinkButton>
              <Button size="sm" variant="ghost" icon={Plus} loading={busy === "create"} onClick={() => void create("")} data-stay-new>
                사진만으로 새 영상
              </Button>
            </div>
          </div>
        )}
        {list.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-[12.5px] text-fg-muted">만든 영상</span>
            <Select className="w-64" value={p?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="숙소 영상 고르기" />
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
        )}
      </SectionCard>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={ImagePlus} title="숙소 영상이 없습니다" description="[새 숙소 영상]을 누르고 숙소 사진을 넣어 주세요." />
      ) : (
        <>
          {/* v0.9.182 지금 어디까지 했는지 한눈에 */}
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-stay-steps>
            {steps.map((x) => (
              <li key={x.n} className={cn("rounded-control border px-2.5 py-2", x.ok ? "border-success/40 bg-success-soft" : "border-line bg-surface")}>
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px]", x.ok ? "bg-success text-white" : "bg-subtle text-fg-muted")}>{x.ok ? "✓" : x.n}</span>
                  {x.label}
                </p>
                <p className="mt-0.5 text-[11.5px] text-fg-subtle">{x.sub}</p>
              </li>
            ))}
          </ol>
          <SectionCard title="① 숙소 사진 · 다른 각도" icon={ImagePlus} description={`장소(원본 사진)마다 묶어서 보여 줍니다. 각 장소의 [이 사진으로 다른 각도 컷 만들기]로 같은 장소를 넓게·낮게·가까이 찍은 AI 사진을 만들면 그 장소 아래에 컷으로 들어갑니다. 위에서부터 컷 순서대로 영상이 됩니다 (화살표로 장소 순서 바꾸기, 사진 ${STAY_MAX_PHOTOS}장까지). AI 영상이 완성되면 사진 자리에서 바로 재생됩니다.`} data-stay-photos>
            <div className="mb-3 rounded-control border border-brand-line bg-brand-soft/30 p-2.5" data-stay-product>
              {linked ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px]">
                    숙소 <b>{linked.name}</b> <span className="text-fg-subtle">(제품 라이브러리)</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === "product"}
                    onClick={() =>
                      window.confirm("제품 라이브러리의 사진으로 다시 가져올까요? 지금 사진·AI 움직임은 지우고 새로 넣습니다.") &&
                      void run("product", async () => {
                        const r = await call<{ project: Project; added: number; found: number }>({ action: "product", id: p.id, productId: linked.id, replace: true });
                        setP(r.project);
                        setMsg({ tone: r.added ? "info" : "warning", text: r.added ? `사진 ${r.added}장을 다시 가져왔습니다.` : "가져올 사진이 없습니다. 제품 라이브러리 › 내 사진에 올려 주세요." });
                      })
                    }
                    data-stay-product-go
                  >
                    사진 다시 가져오기
                  </Button>
                  <a href={`/tools/product-library/${linked.id}`} className="text-[12px] text-brand hover:underline">
                    제품 라이브러리에서 사진 관리 →
                  </a>
                </div>
              ) : stays && stays.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  이 영상에 숙소 연결
                  <Select className="w-64" value="" placeholder="숙소 고르기" onChange={(e) => e.target.value && void run("product", async () => { const r = await call<{ project: Project; added: number }>({ action: "product", id: p.id, productId: e.target.value }); setP(r.project); setMsg({ tone: r.added ? "info" : "warning", text: r.added ? `사진 ${r.added}장을 가져왔습니다.` : "가져올 사진이 없습니다." }); })} options={stays.map((x) => ({ value: x.id, label: x.name }))} aria-label="숙소 연결" />
                </div>
              ) : (
                <p className="text-[12px] text-fg-muted">
                  숙소도 제품처럼 관리합니다. <b>제품 상세페이지 학습</b>으로 저장하고 분류를 <b>숙소</b>로 고른 뒤, 제품 상세의 <b>내 사진</b>에 숙소 사진을 올리면 위쪽 <b>숙소 고르기</b>에서 골라 바로 영상을 만들 수 있습니다.
                </p>
              )}
            </div>
            <Input key={`n${p.updatedAt}`} defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && void save({ name: e.target.value })} placeholder="숙소 이름 (예: 가평 ○○ 글램핑)" aria-label="숙소 이름" />
            <Textarea key={`m${p.updatedAt}`} className="mt-2" rows={2} defaultValue={p.note} onBlur={(e) => e.target.value !== p.note && void save({ note: e.target.value })} placeholder="사실 메모 (선택, 대본에 그대로 근거로 씀) — 예: 해발 300m, 개별 노천탕, 서울에서 1시간 반" aria-label="숙소 메모" />
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
              <ol className="mt-3 space-y-3" data-stay-list>
                {groups.map((g, gi) => {
                  const root = g.root;
                  const pending = (p.angleTasks ?? []).filter((t) => t.sourceKey === root.key && t.state === "waiting");
                  const fails = (p.angleTasks ?? []).filter((t) => t.sourceKey === root.key && t.state === "fail" && Date.now() - Date.parse(t.createdAt ?? "") < 30 * 60_000).slice(-2);
                  const isOpen = angleOpen === root.key;
                  const moveGroup = (d: number) => {
                    const arr = [...groups];
                    const [x] = arr.splice(gi, 1);
                    arr.splice(Math.max(0, Math.min(arr.length, gi + d)), 0, x);
                    void save({ photos: arr.flatMap((y) => [y.root, ...y.children]) });
                  };
                  return (
                    <li key={root.key} className="rounded-card border border-line bg-surface p-2.5" data-stay-group>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-full bg-subtle px-2 py-0.5 text-[12px] font-semibold">장소 {gi + 1}</span>
                        <span className="text-[12px] text-fg-subtle">
                          컷 {g.children.length + 1}개{pending.length ? ` · 각도 ${pending.length}장 만드는 중` : ""}
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          <button type="button" onClick={() => moveGroup(-1)} disabled={gi === 0} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="장소 위로">
                            <ArrowUp className="size-4" />
                          </button>
                          <button type="button" onClick={() => moveGroup(1)} disabled={gi === groups.length - 1} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="장소 아래로">
                            <ArrowDown className="size-4" />
                          </button>
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cutRow(root, "원본 사진", false, () => window.confirm(g.children.length ? `이 장소 사진을 뺄까요? 이 사진으로 만든 각도 ${g.children.length}장도 같이 빠집니다.` : "이 사진을 뺄까요?") && void save({ photos: p.photos.filter((x) => x.key !== root.key && x.fromKey !== root.key) }))}
                        {g.children.map((ph) => cutRow(ph, `AI 각도 · ${STAY_ANGLES.find((x) => x.value === ph.angle)?.label ?? ph.angle ?? ""}`, true, () => window.confirm("이 각도 사진을 뺄까요?") && void save({ photos: p.photos.filter((x) => x.key !== ph.key) })))}
                        {pending.map((t) => (
                          <div key={t.id} className="ml-6 flex items-center gap-2 rounded-control border border-dashed border-brand-line bg-brand-soft/20 p-2 text-[12px] text-brand" data-stay-angle-pending>
                            <span className="flex aspect-[9/16] w-12 items-center justify-center rounded bg-subtle">
                              <Sparkles className="size-4 animate-pulse" />
                            </span>
                            {STAY_ANGLES.find((x) => x.value === t.angle)?.label ?? t.angle} 각도 만드는 중… (30초~1분, 자동 확인)
                          </div>
                        ))}
                        {fails.map((t) => (
                          <p key={t.id} className="ml-6 text-[12px] text-danger">
                            {STAY_ANGLES.find((x) => x.value === t.angle)?.label ?? t.angle} 각도 실패: {t.error ?? "만들지 못했습니다."}
                          </p>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-line pt-2">
                        {!isOpen ? (
                          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAngleOpen(root.key)} data-stay-angle-open>
                            이 사진으로 다른 각도 컷 만들기
                          </Button>
                        ) : (
                          <div className="space-y-2" data-stay-angles>
                            <p className="text-[12px] text-fg-muted">
                              같은 장소를 다른 자리에서 찍은 것처럼 AI 사진을 만들어 이 장소 컷으로 넣습니다. 만들 각도를 고르세요 (1장 약 ${(STAY_ANGLE_CREDITS * AI_CLIP_CONFIG.creditUsd).toFixed(2)}).
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {STAY_ANGLES.map((a) => (
                                <button
                                  key={a.value}
                                  type="button"
                                  aria-pressed={angleKinds.has(a.value)}
                                  onClick={() =>
                                    setAngleKinds((o) => {
                                      const n = new Set(o);
                                      if (n.has(a.value)) n.delete(a.value);
                                      else n.add(a.value);
                                      return n;
                                    })
                                  }
                                  className={cn("h-8 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-inset", angleKinds.has(a.value) ? "bg-brand-soft text-brand ring-brand-line" : "text-fg-muted ring-line hover:bg-subtle")}
                                >
                                  {angleKinds.has(a.value) && "✓ "}
                                  {a.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                icon={Sparkles}
                                loading={busy === "angles"}
                                disabled={!angleKinds.size}
                                onClick={() =>
                                  window.confirm(
                                    `장소 ${gi + 1} 사진으로 다른 각도 ${angleKinds.size}장을 만들까요?\n예상 비용 약 $${(angleKinds.size * STAY_ANGLE_CREDITS * AI_CLIP_CONFIG.creditUsd).toFixed(2)} (Kie 크레딧 ${angleKinds.size * STAY_ANGLE_CREDITS}). 한 번 누르면 바로 과금됩니다.\n만든 사진을 움직이게 하는 것(③)은 따로 1장 약 $${((AI_CLIP_CONFIG.product.credits ?? 20) * AI_CLIP_CONFIG.creditUsd).toFixed(2)}입니다.`,
                                  ) &&
                                  void run("angles", async () => {
                                    const r = await call<{ project: Project; created: number }>({ action: "angles", id: p.id, keys: [root.key], angles: [...angleKinds], confirmed: true });
                                    setP(r.project);
                                    setAngleOpen(null);
                                    setMsg({ tone: "info", text: `장소 ${gi + 1}의 각도 사진 ${r.created}장 만들기를 시작했습니다. 30초~1분 뒤 이 장소 아래에 사진으로 나타납니다 (자동 확인, 무료).` });
                                  })
                                }
                                data-stay-angles-go
                              >
                                {angleKinds.size}장 만들기 · 약 ${(angleKinds.size * STAY_ANGLE_CREDITS * AI_CLIP_CONFIG.creditUsd).toFixed(2)}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setAngleOpen(null)}>
                                닫기
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
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
              <Button icon={Wand2} loading={busy === "translate"} disabled={!p.photos.some((x) => x.motion.trim())} onClick={() => void run("translate", async () => setP(await call<Project>({ action: "translate", id: p.id })))} data-stay-translate>
                움직임 한글 번역
              </Button>
              <span className="text-[12px] text-fg-subtle">사진 {p.photos.length}장 · 약 {Math.round(p.photos.reduce((n, x) => n + (x.sec ?? 2.5), 0))}초 영상 · 대사는 컷과 따로 이어 읽음</span>
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
              {making ? "만드는 중… (자동 확인)" : todo ? `${todo}장 살아 움직이게 · 약 ${usd}` : "모두 만들었습니다"}
            </Button>
            <p className="mt-2 text-[12px] text-fg-subtle" data-stay-animate-progress>
              완성 {done}/{p.photos.length}컷 — 완성된 AI 영상은 ① 각 컷의 사진 자리에서 바로 재생됩니다.
            </p>
          </SectionCard>

          <SectionCard title="④ 영상 만들기" icon={Film} description="완성된 AI 컷을 순서대로 이어 붙이고, 처음 몇 초 위쪽 제목 + 가운데 자막 + AI 내레이션을 넣습니다 (음악 없음). 내레이션 목소리를 먼저 고르세요." data-stay-render>
            <StayVoicePanel value={p.voice ?? null} onSave={(v) => void save({ voice: v })} />
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

/** v0.9.182 AI 내레이션 목소리 (타입캐스트 성우·감정 / OpenAI 목소리·말투 + 속도) — 이 숙소 영상에 저장 */
function StayVoicePanel({ value, onSave }: { value: StayVoice | null; onSave: (v: StayVoice | null) => void }) {
  const [opts, setOpts] = useState<VideoProductionOptions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void api.videoProduction
      .options("youtube")
      .then(setOpts)
      .catch(() => setFailed(true));
  }, []);
  const engine = value?.ttsEngine ?? "typecast";
  const speed = value?.voiceSpeed ?? DEFAULT_VOICE_SPEED;
  const put = (patch: Partial<StayVoice>) => {
    const next = { ttsEngine: engine, voice: value?.voice ?? "", ttsEmotion: value?.ttsEmotion, voiceStyle: value?.voiceStyle, voiceSpeed: speed, ...patch } as StayVoice;
    // 목소리를 아직 안 골랐으면 저장하지 않고 화면만 (엔진만 바꾼 경우)
    onSave(next.voice ? next : { ...next, voice: "" });
  };
  return (
    <div className="mb-3 space-y-2.5 rounded-control border border-line bg-subtle/40 p-2.5 text-[12.5px]" data-stay-voice>
      <p className="font-semibold">
        AI 내레이션 목소리{" "}
        <span className="font-normal text-fg-subtle">{value?.voice ? "(이 영상에 저장됨)" : "— 아직 안 고름: 원고로 영상 만들기에서 마지막으로 쓴 목소리로 만듭니다"}</span>
      </p>
      {failed ? (
        <p className="text-fg-muted">목소리 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>
      ) : !opts ? (
        <p className="text-fg-muted">목소리 목록 준비 중…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-fg-muted">음성 엔진</span>
            <SegmentedControl size="sm" value={engine} onChange={(v) => put({ ttsEngine: v as StayVoice["ttsEngine"], voice: "", ttsEmotion: undefined, voiceStyle: undefined })} options={[{ value: "typecast", label: "타입캐스트" }, { value: "openai", label: "OpenAI" }]} />
          </div>
          {engine === "typecast" ? (
            <TypecastVoicePicker channelId="youtube" ready={opts.ready.typecast} value={value?.ttsEngine === "typecast" ? value.voice : ""} onChange={(id) => put({ voice: id })} emotion={value?.ttsEmotion ?? "normal"} onEmotion={(v) => put({ ttsEmotion: v })} emotions={opts.typecastEmotions} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={value?.ttsEngine === "openai" && value.voice ? value.voice : ""} placeholder="목소리 고르기" options={opts.voices.map((v) => ({ value: v.value, label: v.label }))} onChange={(e) => put({ voice: e.target.value })} aria-label="OpenAI 목소리" />
              <Select value={value?.voiceStyle ?? "shorts"} options={opts.voiceStyles} onChange={(e) => put({ voiceStyle: e.target.value })} aria-label="말투" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-fg-muted">말하기 속도</span>
            <SegmentedControl size="sm" value={String(speed)} onChange={(v) => put({ voiceSpeed: Number(v) })} options={VOICE_SPEEDS.map((x) => ({ value: String(x), label: x === 0 ? "자동" : x === 1 ? "보통" : `${x}배` }))} />
          </div>
        </>
      )}
    </div>
  );
}
