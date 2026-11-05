"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Plus, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { MULTICAM_ANGLES, MULTICAM_MODELS, type AngleId, type GenAspect, type MulticamCut, type MulticamModel } from "@/lib/multicam/types";

/**
 * AI 메이크업 · 멀티앵글 (v0.9.176) — ① 원본 올리기 → ② 구간 → ③ 컷 시간표 (AI 로 짜기 / 직접) → ④ Kie 로 만들기 (확인 후) → 결과 (원본 소리 그대로)
 */
interface Project {
  id: string;
  name: string;
  srcKey: string | null;
  srcDuration: number | null;
  from: number;
  to: number;
  inputKey: string | null;
  subject: string;
  cuts: MulticamCut[];
  model: MulticamModel;
  resolution: "480p" | "720p";
  keepAudio: boolean;
  promptOverride: string;
  task: { taskId: string | null; state: "waiting" | "success" | "fail"; error: string | null } | null;
  resultKey: string | null;
  urls: Record<string, string>;
  prompt: string;
  estimate: { seconds: number; credits: number; usd: number };
  /** v0.9.177 원본도 AI 로 */
  gen?: { idea: string; dialogue: string; prompt: string; model: MulticamModel; resolution: "480p" | "720p"; seconds: number; aspect: GenAspect; task: { state: "waiting" | "success" | "fail"; error: string | null } | null } | null;
  genEstimate: { seconds: number; credits: number; usd: number } | null;
  updatedAt: string;
}

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/multicam" : `/api/multicam${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}
const sec = (n: number) => `${n.toFixed(1)}초`;

export function MulticamStudio() {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState(false);
  const [srcMode, setSrcMode] = useState<"upload" | "ai">("upload");
  // AI 원본 입력 (프롬프트 만들기 전까지 화면에만)
  const [idea, setIdea] = useState("");
  const [dialogue, setDialogue] = useState("");
  const [genOpt, setGenOpt] = useState<{ model: MulticamModel; resolution: "480p" | "720p"; seconds: number; aspect: GenAspect }>({ model: "mini", resolution: "720p", seconds: 10, aspect: "9:16" });
  const [genPromptText, setGenPromptText] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  // 프로젝트를 열 때 AI 원본 입력칸도 그 값으로
  const open = useCallback(async (id: string) => {
    const np = await call<Project>(undefined, id);
    setP(np);
    setIdea(np.gen?.idea ?? "");
    setDialogue(np.gen?.dialogue ?? "");
    if (np.gen) setGenOpt({ model: np.gen.model, resolution: np.gen.resolution, seconds: np.gen.seconds, aspect: np.gen.aspect });
    setGenPromptText(np.gen?.prompt ?? "");
    setSrcMode(np.gen && !np.srcKey ? "ai" : "upload");
  }, []);
  const loadList = useCallback(async () => {
    try {
      const l = await call<{ id: string; name: string }[]>();
      setList(l);
      if (l[0]) await open(l[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [open]);
  useEffect(() => {
    void (async () => loadList())();
  }, [loadList]);
  // 만드는 중이면 10초마다 확인 (무료)
  const waiting = p?.task?.state === "waiting" || p?.gen?.task?.state === "waiting";
  useEffect(() => {
    if (!p || !waiting) return;
    const t = setInterval(() => void call<Project>({ action: "status", id: p.id }).then(setP).catch(() => undefined), 10_000);
    return () => clearInterval(t);
  }, [p, waiting]);

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
  const save = (patch: Record<string, unknown>) => p && run("save", async () => setP(await call<Project>({ action: "update", id: p.id, ...patch })));
  const setCut = (i: number, patch: Partial<MulticamCut>) => p && save({ cuts: p.cuts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const dur = p ? Math.max(0, p.to - p.from) : 0;
  const model = MULTICAM_MODELS.find((m) => m.value === p?.model) ?? MULTICAM_MODELS[0];

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="불러오는 중…" />;

  return (
    <div className="space-y-5" data-multicam>
      <SectionCard title="① 원본 영상" icon={Upload} description="카메라 1대로 찍은 메이크업 영상을 올리거나(무료), 한국어 설명으로 AI 원본을 만듭니다 (Kie, 유료). 인물·옷·장소·손동작이 계속 같을수록 멀티앵글 결과가 자연스럽습니다.">
        <SegmentedControl className="mb-3" value={srcMode} onChange={(v) => setSrcMode(v as "upload" | "ai")} options={[{ value: "upload", label: "영상 올리기" }, { value: "ai", label: "AI 로 원본 만들기" }]} />
        <div className="flex flex-wrap items-center gap-2">
          {srcMode === "upload" ? (
            <Button variant="primary" icon={Upload} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-mc-upload>
              원본 올리기
            </Button>
          ) : (
            <Button variant="primary" icon={Plus} loading={busy === "gen-create"} onClick={() => void run("gen-create", async () => { const np = await call<Project>({ action: "gen-create" }); setList((l) => [{ id: np.id, name: np.name }, ...(l ?? [])]); setP(np); setIdea(""); setDialogue(""); setGenPromptText(""); })} data-mc-gen-new>
              새 AI 원본
            </Button>
          )}
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
                const np = await call<Project>({ action: "probe", id: up.id });
                setList((l) => [{ id: np.id, name: np.name }, ...(l ?? [])]);
                setP(np);
              });
            }}
          />
          {list.length > 0 && <Select className="w-64" value={p?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="만든 것" />}
          {p && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`'${p.name}'을(를) 지울까요?`) && void run("remove", async () => (await call({ action: "remove", id: p.id }), setP(null), await loadList()))}>
              지우기
            </Button>
          )}
        </div>
        {srcMode === "ai" && p?.gen && (
          <div className="mt-3 space-y-2 rounded-control border border-brand-line bg-brand-soft/20 p-3" data-mc-gen>
            <Textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={"어떤 영상인지 한국어로 (예: 주차된 베이지색 SUV 안에서 20대 한국 여성 뷰티 크리에이터가 대시보드에 고정한 카메라를 보며 앰플 → 쿠션 → 아이섀도 → 마스카라 → 립 → 블러셔 순서로 화장한다. 회색 니트, 긴 갈색 머리, 자연광)"} aria-label="영상 설명" />
            <Textarea rows={2} value={dialogue} onChange={(e) => setDialogue(e.target.value)} placeholder="말할 대사 (선택, 한국어 그대로 들어갑니다) — 예: 오늘은 차 안에서 5분 메이크업 해볼게요" aria-label="대사" />
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <SegmentedControl size="sm" value={genOpt.model} onChange={(v) => setGenOpt((o) => ({ ...o, model: v as MulticamModel }))} options={MULTICAM_MODELS.map((m) => ({ value: m.value, label: m.label }))} />
              <SegmentedControl size="sm" value={genOpt.resolution} onChange={(v) => setGenOpt((o) => ({ ...o, resolution: v as "480p" | "720p" }))} options={[{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }]} />
              <Select className="w-28" value={String(genOpt.seconds)} onChange={(e) => setGenOpt((o) => ({ ...o, seconds: Number(e.target.value) }))} options={[4, 6, 8, 10, 12, 15, 20, 25, 30].filter((v) => v <= (MULTICAM_MODELS.find((m) => m.value === genOpt.model)?.maxOut ?? 15)).map((v) => ({ value: String(v), label: `${v}초` }))} aria-label="길이" />
              <Select className="w-28" value={genOpt.aspect} onChange={(e) => setGenOpt((o) => ({ ...o, aspect: e.target.value as GenAspect }))} options={["9:16", "16:9", "3:4", "1:1"].map((v) => ({ value: v, label: v }))} aria-label="비율" />
              <Button variant="secondary" icon={Wand2} loading={busy === "gen-prompt"} disabled={!idea.trim()} onClick={() => void run("gen-prompt", async () => { const np = await call<Project>({ action: "gen-prompt", id: p.id, idea, dialogue, ...genOpt }); setP(np); setGenPromptText(np.gen?.prompt ?? ""); })} data-mc-gen-prompt>
                프롬프트 만들기 (AI 1번)
              </Button>
            </div>
            {genPromptText && (
              <>
                <p className="text-[11.5px] text-fg-subtle">Seedance 프롬프트 — 화면 설명은 영어, 대사는 한국어 그대로입니다. 고쳐도 됩니다.</p>
                <Textarea rows={6} className="font-mono text-[11.5px]" value={genPromptText} onChange={(e) => setGenPromptText(e.target.value)} aria-label="원본 프롬프트" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    loading={busy === "gen-video"}
                    disabled={waiting}
                    onClick={() =>
                      window.confirm(`AI 원본 ${p.gen!.seconds}초를 만들까요? (${MULTICAM_MODELS.find((m) => m.value === p.gen!.model)?.label} ${p.gen!.resolution})\n예상 ${p.genEstimate?.credits ?? "?"} 크레딧 (약 ${p.genEstimate?.usd ?? "?"}). 한 번 누르면 바로 과금됩니다.\n만든 영상은 바로 원본이 되고, 그다음 멀티앵글(④)은 따로 과금됩니다.`) &&
                      void run("gen-video", async () => {
                        setP(await call<Project>({ action: "gen-video", id: p.id, prompt: genPromptText, confirmed: true }));
                        setMsg({ tone: "info", text: "AI 원본 만들기를 시작했습니다. 보통 2~5분 걸립니다 (자동 확인, 무료)." });
                      })
                    }
                    data-mc-gen-go
                  >
                    {p.gen.task?.state === "waiting" ? "원본 만드는 중… (자동 확인)" : `원본 만들기 · 약 ${p.genEstimate?.usd ?? "?"}`}
                  </Button>
                  {genPromptText !== p.gen.prompt && <span className="text-[11.5px] text-fg-subtle">고친 프롬프트로 만듭니다 (설정을 바꿨으면 [프롬프트 만들기]를 다시 눌러 주세요)</span>}
                  {p.gen.task?.state === "fail" && <span className="text-[12px] text-danger">실패: {p.gen.task.error}</span>}
                  {p.gen.task?.state === "success" && <Badge tone="success">원본 완성 — 아래 ②부터 이어서</Badge>}
                </div>
              </>
            )}
          </div>
        )}
      </SectionCard>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={Clapperboard} title="아직 없습니다" description="[원본 올리기] 또는 [AI 로 원본 만들기]로 시작하세요." />
      ) : !p.srcKey ? null : (
        <>
          <SectionCard title="② 모델 · 구간" icon={Clapperboard} description={`Kie 는 넣은 영상 길이 + 만든 영상 길이만큼 과금합니다. ${model.label} 는 ${model.maxIn}초까지 넣을 수 있어요.`} data-mc-range>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl value={p.model} onChange={(v) => void save({ model: v })} options={MULTICAM_MODELS.map((m) => ({ value: m.value, label: m.label }))} />
              <SegmentedControl value={p.resolution} onChange={(v) => void save({ resolution: v })} options={[{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }]} />
            </div>
            <div key={`r${p.updatedAt}`} className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              원본 {p.srcDuration ? sec(p.srcDuration) : "?"} 중
              <Input type="number" step="0.1" className="h-8 w-24" defaultValue={p.from} onBlur={(e) => Number(e.target.value) !== p.from && void save({ from: Number(e.target.value) })} aria-label="시작" />
              초부터
              <Input type="number" step="0.1" className="h-8 w-24" defaultValue={p.to} onBlur={(e) => Number(e.target.value) !== p.to && void save({ to: Number(e.target.value) })} aria-label="끝" />
              초까지 = <b>{sec(dur)}</b>
              <Badge tone="info">예상 {p.estimate.credits} 크레딧 · 약 ${p.estimate.usd}</Badge>
            </div>
            {p.srcKey && p.urls[p.srcKey] && <video src={p.urls[p.srcKey]} controls playsInline className="mt-3 max-h-[300px] rounded bg-black" />}
          </SectionCard>

          <SectionCard title="③ 컷 시간표" icon={Wand2} description="구간 안에서 언제 어떤 구도로 보여 줄지 정합니다. [AI 로 컷 짜기]는 1초마다 화면을 보고 화장 단계(쿠션·아이섀도·마스카라·립·블러셔)에 맞는 구도를 골라 줍니다 (AI 1번)." data-mc-cuts>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={Sparkles} loading={busy === "plan"} disabled={dur < 2} onClick={() => void run("plan", async () => setP(await call<Project>({ action: "plan", id: p.id })))} data-mc-plan>
                AI 로 컷 짜기
              </Button>
              <Button size="sm" variant="ghost" icon={Plus} disabled={p.cuts.length >= 16} onClick={() => { const last = p.cuts.at(-1); const s = last ? last.end : 0; void save({ cuts: [...p.cuts, { start: s, end: Math.min(dur, s + 2), angle: "front" as AngleId, note: "" }] }); }}>
                컷 추가
              </Button>
            </div>
            <Input key={`s${p.updatedAt}`} className="mt-3 text-[12.5px]" defaultValue={p.subject} onBlur={(e) => e.target.value !== p.subject && void save({ subject: e.target.value })} placeholder="유지할 인물·옷·장소 (영어, 예: same young Korean woman, same grey sweater, same beige SUV, same daylight)" aria-label="유지할 것" />
            <ol className="mt-3 space-y-1.5">
              {p.cuts.map((c, i) => (
                <li key={`${i}-${p.updatedAt}`} className="flex flex-wrap items-center gap-1.5 rounded-control border border-line p-2 text-[12.5px]" data-mc-cut>
                  <span className="w-5 text-center font-bold text-fg-subtle">{i + 1}</span>
                  <Input type="number" step="0.1" className="h-8 w-20" defaultValue={c.start} onBlur={(e) => Number(e.target.value) !== c.start && setCut(i, { start: Number(e.target.value) })} aria-label={`${i + 1}번 시작`} />
                  ~
                  <Input type="number" step="0.1" className="h-8 w-20" defaultValue={c.end} onBlur={(e) => Number(e.target.value) !== c.end && setCut(i, { end: Number(e.target.value) })} aria-label={`${i + 1}번 끝`} />
                  초
                  <Select className="w-52" value={c.angle} onChange={(e) => setCut(i, { angle: e.target.value as AngleId })} options={MULTICAM_ANGLES.map((a) => ({ value: a.value, label: a.label }))} aria-label={`${i + 1}번 구도`} />
                  <Input className="h-8 min-w-[160px] flex-1" defaultValue={c.note} onBlur={(e) => e.target.value !== c.note && setCut(i, { note: e.target.value })} placeholder="동작 (예: cushion, mascara)" aria-label={`${i + 1}번 동작`} />
                  <button type="button" onClick={() => void save({ cuts: p.cuts.filter((_, j) => j !== i) })} className="text-fg-subtle hover:text-danger" aria-label="컷 빼기">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-3">
              <button type="button" className="text-[12px] text-brand hover:underline" onClick={() => setEditPrompt((v) => !v)}>
                {editPrompt ? "프롬프트 닫기" : "Seedance 프롬프트 보기·고치기"}
              </button>
              {editPrompt && (
                <>
                  <Textarea key={`p${p.updatedAt}`} rows={14} className="mt-1 font-mono text-[11.5px]" defaultValue={p.prompt} onBlur={(e) => e.target.value !== p.prompt && void save({ promptOverride: e.target.value })} aria-label="프롬프트" />
                  {p.promptOverride && (
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => void save({ promptOverride: "" })}>
                      컷 시간표로 다시 만들기
                    </Button>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="④ 만들기 (Kie, 유료)" icon={Clapperboard} description="같은 연기·같은 타이밍으로 카메라만 바꾼 영상을 만듭니다. 모든 구도가 매번 정확히 나오지는 않습니다 — 결과가 흔들리면 컷 수를 줄여(정면 → 눈 → 입술 → 정면) 다시 해 보세요." data-mc-generate>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={p.keepAudio} onChange={(e) => void save({ keepAudio: e.target.checked })} />
                원본 소리 그대로 붙이기 (말·타이밍 그대로)
              </label>
              <Button
                variant="primary"
                icon={Clapperboard}
                loading={busy === "generate"}
                disabled={waiting || dur < 2 || !p.cuts.length}
                onClick={() =>
                  window.confirm(`${model.label} ${p.resolution} 로 ${sec(dur)} 영상을 만들까요?\n예상 ${p.estimate.credits} 크레딧 (약 $${p.estimate.usd}) — 넣은 영상 + 만든 영상 길이만큼. 한 번 누르면 바로 과금됩니다.`) &&
                  void run("generate", async () => {
                    setP(await call<Project>({ action: "generate", id: p.id, confirmed: true }));
                    setMsg({ tone: "info", text: "만들기를 시작했습니다. 보통 2~6분 걸립니다 (자동 확인, 무료)." });
                  })
                }
                data-mc-go
              >
                {waiting ? "만드는 중… (자동 확인)" : `만들기 · 약 $${p.estimate.usd}`}
              </Button>
              {p.task?.state === "fail" && <span className="text-[12px] text-danger">실패: {p.task.error}</span>}
            </div>
            {p.resultKey && p.urls[p.resultKey] && (
              <div className="mt-3 grid gap-3 md:grid-cols-2" data-mc-result>
                <div>
                  <p className="mb-1 text-[12px] font-semibold text-fg-muted">원본 구간</p>
                  {p.inputKey && p.urls[p.inputKey] && <video src={p.urls[p.inputKey]} controls playsInline className="max-h-[420px] w-full rounded bg-black" />}
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-semibold text-fg-muted">멀티앵글 결과</p>
                  <video src={p.urls[p.resultKey]} controls playsInline className="max-h-[420px] w-full rounded bg-black" />
                  <a href={p.urls[p.resultKey]} download={`${p.name}_멀티앵글.mp4`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] text-brand hover:underline">
                    MP4 받기
                  </a>
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
