"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Plus, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { MULTICAM_ANGLES, MULTICAM_MODELS, type AngleId, type MulticamCut, type MulticamModel } from "@/lib/multicam/types";

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
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (id: string) => setP(await call<Project>(undefined, id)), []);
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
  const waiting = p?.task?.state === "waiting";
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
      <SectionCard title="① 원본 영상" icon={Upload} description="카메라 1대로 찍은 메이크업 영상을 올립니다 (무료). 인물·옷·장소·손동작이 계속 같을수록 결과가 자연스럽습니다.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Upload} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-mc-upload>
            원본 올리기
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
      </SectionCard>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={Clapperboard} title="아직 없습니다" description="[원본 올리기]로 시작하세요." />
      ) : (
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
