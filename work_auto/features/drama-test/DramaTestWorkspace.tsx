"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Clapperboard, Download, ImagePlus, Loader2, Plus, RefreshCw, Sparkles, Trash2, Users } from "lucide-react";
import { DRAMA_LIMITS, DRAMA_MODELS, dramaCostUsd, type DramaModelId } from "@/lib/drama/config";
import type { DramaCharacter, DramaScene, DramaTask } from "@/lib/types/drama";
import { api } from "@/lib/api-client";
import { Badge, Button, EmptyState, Input, Notice, SectionCard, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const STORE = "drama-test:v1";
const DAY = 24 * 60 * 60 * 1000;
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `dr-${Date.now()}`);
const PENDING = (t: DramaTask) => t.state === "waiting" || t.state === "generating";
const STATE_LABEL: Record<DramaTask["state"], { label: string; tone: "info" | "success" | "danger" }> = {
  waiting: { label: "대기 중", tone: "info" },
  generating: { label: "만드는 중", tone: "info" },
  success: { label: "완료", tone: "success" },
  fail: { label: "실패", tone: "danger" },
};

const emptyChar = (i: number): DramaCharacter => ({ id: `c${i + 1}`, name: "", description: "", imageUrl: null, closeUrl: null, uploadedAt: null });
const DEFAULT_CHARS: DramaCharacter[] = [
  { ...emptyChar(0), name: "민준", description: "20대 한국 남성, 짧은 검은 머리, 베이지 셔츠에 흰 티셔츠, 청바지" },
  { ...emptyChar(1), name: "지아", description: "20대 한국 여성, 긴 웨이브 검은 머리, 흰 셔츠, 청바지" },
];
const DEFAULT_SCENES: DramaScene[] = [
  { id: "s1", description: "따뜻한 햇살이 드는 카페 창가. 민준이 커피 두 잔을 들고 와서 지아 앞에 앉는다.", dialogue: "민준: 오래 기다렸지?\n지아: 아니, 나도 방금 왔어." },
  { id: "s2", description: "같은 카페 안. 지아가 휴대폰을 보다가 놀란 표정으로 민준을 바라본다.", dialogue: "지아: 이거 진짜야?\n민준: 응, 나도 아까 봤어." },
  { id: "s3", description: "해 질 녘 카페 앞 거리. 두 사람이 웃으며 나란히 걸어간다.", dialogue: "민준: 오늘 저녁은 내가 살게.\n지아: 정말? 그럼 맛있는 거 먹자." },
];

interface Saved {
  characters: DramaCharacter[];
  scenes: DramaScene[];
  models: DramaModelId[];
  tasks: DramaTask[];
}
function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** 사진 → 긴 쪽 1536px JPEG (올리는 크기를 줄인다) */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("사진을 읽지 못했습니다."));
      i.src = url;
    });
    const fit = Math.min(1, DRAMA_LIMITS.imageMaxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * fit);
    c.height = Math.round(img.naturalHeight * fit);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * AI 드라마 시험 (v0.9.62). docs/DRAMA_TEST.md
 * 같은 인물·같은 장면을 여러 모델로 만들어 비교한다. [시험 만들기] 1번 = 장면 수 × 모델 수 (각 Kie 1회 과금).
 * 상태 확인은 무료 — 만드는 중이면 20초마다. 작성한 내용·작업 번호는 이 브라우저에만 기억한다 (비밀값 없음).
 */
export function DramaTestWorkspace() {
  const [characters, setCharacters] = useState<DramaCharacter[]>(DEFAULT_CHARS);
  const [scenes, setScenes] = useState<DramaScene[]>(DEFAULT_SCENES);
  const [models, setModels] = useState<DramaModelId[]>(DRAMA_MODELS.map((m) => m.id));
  const [tasks, setTasks] = useState<DramaTask[]>([]);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState<"make" | "check" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tasksRef = useRef<DramaTask[]>([]);

  // 이 브라우저에 기억한 내용 불러오기
  useEffect(() => {
    void Promise.resolve().then(() => {
      const s = load();
      if (s) {
        if (s.characters?.length) setCharacters(s.characters);
        if (s.scenes?.length) setScenes(s.scenes);
        if (s.models?.length) setModels(s.models);
        if (s.tasks?.length) setTasks(s.tasks);
      }
      setReady(true);
    });
    // 사진 24시간 만료 표시를 1분마다 갱신
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    tasksRef.current = tasks;
    if (!ready) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ characters, scenes, models, tasks } satisfies Saved));
    } catch {
      /* 저장 못 해도 계속 */
    }
  }, [characters, scenes, models, tasks, ready]);

  const expired = (c: DramaCharacter) => Boolean(c.uploadedAt && now - Date.parse(c.uploadedAt) > DAY - 60 * 60 * 1000);
  const cast = characters.filter((c) => c.imageUrl && !expired(c));
  const validScenes = scenes.filter((s) => s.description.trim());
  const cost = dramaCostUsd(models, validScenes.length);
  const count = validScenes.length * models.length;
  const pending = tasks.some(PENDING);

  async function pickImage(c: DramaCharacter, file: File | undefined) {
    if (!file) return;
    setUploading(c.id);
    setNote(null);
    try {
      const dataUrl = await shrink(file);
      setPreview((p) => ({ ...p, [c.id]: dataUrl }));
      const r = await api.drama.upload(dataUrl);
      setCharacters((list) => list.map((x) => (x.id === c.id ? { ...x, ...r } : x)));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setUploading(null);
    }
  }

  async function make() {
    if (busy || !count || !cast.length) return;
    setBusy("make");
    setNote(null);
    try {
      const r = await api.drama.create({ characters: cast, scenes: validScenes, models, clientRequestId: newId() });
      setTasks(r.tasks);
      const failed = r.tasks.filter((t) => t.state === "fail");
      setNote(`${r.created}편을 만들기 시작했습니다 (보통 2~10분).${failed.length ? ` 실패 ${failed.length}편: ${failed[0].error ?? ""}` : ""}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const check = useCallback(async () => {
    const list = tasksRef.current;
    if (!list.some(PENDING)) return;
    setBusy((b) => b ?? "check");
    try {
      setTasks((await api.drama.status(list)).tasks);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "상태를 확인하지 못했습니다.");
    } finally {
      setBusy((b) => (b === "check" ? null : b));
    }
  }, []);
  // 만드는 중이면 20초마다 (무료 API)
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void check(), 20_000);
    return () => clearInterval(timer);
  }, [pending, check]);

  const setScene = (id: string, patch: Partial<DramaScene>) => setScenes((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const spent = tasks.reduce((n, t) => n + (t.credits ?? 0), 0);

  return (
    <div className="space-y-6" data-drama-test>
      <Notice tone="warning" title="인물 사진 주의">
        실제 사람(연예인·지인 등) 사진은 본인 동의 없이 쓰면 초상권 문제가 생길 수 있습니다. AI 로 만든 인물이나 동의받은 사진을 써 주세요. 사진은 Kie AI 에 올라가 24시간 뒤 지워지고, 우리 서버에는 남기지 않습니다.
      </Notice>

      <SectionCard title="① 인물" icon={Users} description={`최대 ${DRAMA_LIMITS.characters}명. 전신 사진 1장이면 됩니다 (얼굴 확대 사진은 자동으로 만듭니다). 이름은 대사의 "이름:" 과 같게 써 주세요.`}>
        <div className="grid gap-4 md:grid-cols-3" data-drama-characters>
          {characters.map((c, i) => {
            const src = preview[c.id] ?? c.imageUrl ?? null;
            return (
              <div key={c.id} className="space-y-2 rounded-control border border-line p-3" data-drama-character>
                <label className={cn("relative flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-control bg-subtle text-fg-subtle", uploading === c.id && "opacity-60")}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 올린 사진 미리보기
                    <img src={src} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-xs">
                      <ImagePlus className="size-6" /> 사진 올리기
                    </span>
                  )}
                  {uploading === c.id && <Loader2 className="absolute size-6 animate-spin text-brand" />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pickImage(c, e.target.files?.[0])} aria-label={`인물 ${i + 1} 사진`} />
                </label>
                {c.imageUrl && (expired(c) ? <Badge tone="danger">사진 다시 올리기 (24시간 지남)</Badge> : <Badge tone="success">올림</Badge>)}
                <Input value={c.name} onChange={(e) => setCharacters((l) => l.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} placeholder="이름 (예: 민준)" aria-label={`인물 ${i + 1} 이름`} />
                <Textarea
                  value={c.description}
                  rows={2}
                  onChange={(e) => setCharacters((l) => l.map((x) => (x.id === c.id ? { ...x, description: e.target.value } : x)))}
                  placeholder="생김새·옷 (예: 20대 남성, 베이지 셔츠)"
                  className="text-[12.5px]"
                  aria-label={`인물 ${i + 1} 설명`}
                />
                {characters.length > 1 && (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setCharacters((l) => l.filter((x) => x.id !== c.id).map((x, k) => ({ ...x, id: `c${k + 1}` })))}>
                    빼기
                  </Button>
                )}
              </div>
            );
          })}
          {characters.length < DRAMA_LIMITS.characters && (
            <button type="button" onClick={() => setCharacters((l) => [...l, emptyChar(l.length)])} className="flex min-h-40 items-center justify-center gap-1 rounded-control border border-dashed border-line text-sm text-fg-subtle hover:border-brand hover:text-brand">
              <Plus className="size-4" /> 인물 추가
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="② 장면 · 대사" icon={Clapperboard} description={`장면마다 ${DRAMA_LIMITS.durationSec}초, 세로 9:16. 대사는 "이름: 대사" 한 줄씩 (영상 모델이 직접 한국어로 말합니다).`}>
        <ol className="space-y-3" data-drama-scenes>
          {scenes.map((s, i) => (
            <li key={s.id} className="grid gap-2 rounded-control border border-line p-3 md:grid-cols-[28px_1fr_1fr_auto]" data-drama-scene>
              <span className="text-center text-sm font-semibold text-fg-subtle">{i + 1}</span>
              <Textarea value={s.description} rows={3} onChange={(e) => setScene(s.id, { description: e.target.value })} placeholder="장소·행동 (예: 카페 창가, 민준이 커피를 들고 온다)" className="text-[12.5px]" aria-label={`${i + 1}번 장면 설명`} />
              <Textarea value={s.dialogue} rows={3} onChange={(e) => setScene(s.id, { dialogue: e.target.value })} placeholder={"민준: 오래 기다렸지?\n지아: 아니, 나도 방금 왔어."} className="text-[12.5px]" aria-label={`${i + 1}번 장면 대사`} />
              {scenes.length > 1 && (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setScenes((l) => l.filter((x) => x.id !== s.id))} aria-label="장면 빼기" />
              )}
            </li>
          ))}
        </ol>
        {scenes.length < DRAMA_LIMITS.scenes && (
          <Button size="sm" icon={Plus} className="mt-3" onClick={() => setScenes((l) => [...l, { id: `s${Math.max(0, ...l.map((x) => Number(x.id.slice(1)) || 0)) + 1}`, description: "", dialogue: "" }])}>
            장면 추가
          </Button>
        )}
      </SectionCard>

      <SectionCard title="③ 비교할 모델" icon={Sparkles}>
        <div className="grid gap-2 md:grid-cols-3" data-drama-models>
          {DRAMA_MODELS.map((m) => {
            const on = models.includes(m.id);
            return (
              <label key={m.id} className={cn("flex cursor-pointer gap-2 rounded-control border p-3 text-[13px]", on ? "border-brand bg-brand-soft/40" : "border-line hover:bg-subtle")}>
                <input type="checkbox" checked={on} onChange={() => setModels((l) => (on ? l.filter((x) => x !== m.id) : [...l, m.id]))} className="mt-0.5 accent-[var(--color-brand)]" />
                <span>
                  <span className="block font-semibold text-fg">{m.label}</span>
                  <span className="block text-xs text-fg-subtle">
                    {DRAMA_LIMITS.durationSec}초 약 ${(m.creditsPerSec * DRAMA_LIMITS.durationSec * DRAMA_LIMITS.creditUsd).toFixed(2)} · {m.note}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-[13px] text-fg-muted">
            장면 {validScenes.length}개 × 모델 {models.length}개 = <b>{count}편 · 약 ${cost.toFixed(2)}</b>
            {spent ? ` · 지금까지 실제 ${spent} 크레딧 (약 $${(spent * DRAMA_LIMITS.creditUsd).toFixed(2)})` : ""}
          </p>
          <span className="flex gap-2">
            {pending && (
              <Button icon={RefreshCw} loading={busy === "check"} onClick={() => void check()}>
                상태 확인
              </Button>
            )}
            <Button variant="primary" icon={Sparkles} loading={busy === "make"} disabled={!count || !cast.length || Boolean(busy) || pending} onClick={() => void make()} data-drama-make>
              시험 만들기 ({count}편 · 약 ${cost.toFixed(2)})
            </Button>
          </span>
        </div>
        {!cast.length && <p className="mt-2 text-xs text-warning">인물 사진을 1명 이상 올려 주세요.</p>}
        {note && <p className="mt-2 text-xs text-fg-muted">{note}</p>}
        <p className="mt-1 text-[11px] text-fg-subtle">
          누를 때마다 {count}편이 새로 과금됩니다 (자동 재시도 없음). Kie AI 키가 필요합니다 —{" "}
          <Link href="/settings/api" className="text-brand hover:underline">
            API 연결 센터
          </Link>
          .
        </p>
      </SectionCard>

      <SectionCard title="④ 결과 비교" icon={Clapperboard} description="같은 장면을 모델별로 나란히 봅니다. 결과 영상은 Kie 에 14일 보관됩니다 (마음에 드는 건 받아 두세요).">
        {tasks.length === 0 ? (
          <EmptyState compact title="아직 만든 시험이 없습니다" description="인물·장면·모델을 정하고 [시험 만들기]를 눌러 주세요." />
        ) : (
          <div className="space-y-5" data-drama-results>
            {[...new Set(tasks.map((t) => t.sceneId))].map((sid, i) => {
              const scene = scenes.find((s) => s.id === sid);
              return (
                <div key={sid}>
                  <p className="mb-2 text-[13px] font-semibold text-fg">
                    장면 {i + 1} <span className="font-normal text-fg-subtle">{scene?.description.slice(0, 60)}</span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tasks
                      .filter((t) => t.sceneId === sid)
                      .map((t) => {
                        const m = DRAMA_MODELS.find((x) => x.id === t.modelId);
                        const st = STATE_LABEL[t.state];
                        const playable = t.resultUrl?.startsWith("https://");
                        return (
                          <div key={`${sid}-${t.modelId}`} className="rounded-control border border-line p-2" data-drama-result>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="text-[12.5px] font-semibold text-fg">{m?.label}</span>
                              <Badge tone={st.tone}>
                                {PENDING(t) && <Loader2 className="mr-1 inline size-3 animate-spin" />}
                                {st.label}
                              </Badge>
                            </div>
                            {t.state === "success" && playable ? (
                              <video src={t.resultUrl!} controls playsInline className="aspect-[9/16] w-full rounded bg-black" />
                            ) : (
                              <div className="flex aspect-[9/16] items-center justify-center rounded bg-subtle p-3 text-center text-xs text-fg-subtle">
                                {t.state === "success" ? "데모 모드: 실제 영상 없음" : t.error ?? (PENDING(t) ? "만드는 중입니다 (20초마다 확인)" : "")}
                              </div>
                            )}
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-subtle">
                              <span>{t.credits != null ? `${t.credits} 크레딧 (약 $${(t.credits * DRAMA_LIMITS.creditUsd).toFixed(2)})` : ""}</span>
                              {playable && t.state === "success" && (
                                <a href={t.resultUrl!} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 text-brand hover:underline">
                                  <Download className="size-3" /> 받기
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
