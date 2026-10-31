import "server-only";
import type { GeneratedContent } from "@/lib/types";
import type { VideoJob, VideoPlan } from "@/lib/types/video-production";
import { AppError } from "../http";
import { getAIProvider, getGiphyProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { contentGenerationService } from "../services/content-generation";
import { keywordLibrary } from "../services/keyword-library";
import { productService } from "../services/products";
import { videoJobService } from "../video/service";
import { videoStorage } from "../video/storage";
import { storedVideoIds, usableXhsVideo } from "../video/vault";

/**
 * 제품 홍보 영상 자동 제작 (v0.9.107). docs/AUTO_VIDEO.md
 * 매일 05:00(KST) 오늘 만들 제품 N개를 고르고(start), 05:05~07:55 5분마다 1개씩 만든다(tick).
 * 1개 = 원고 1단계(키워드 분석·제목 후보) → AI 가 제목·Hook·CTA 고름 → 원고 2단계(대본 3편·설명·태그) → AI 가 대본 고름
 *      → 컷 계획(최근에 직접 만든 영상의 목소리·자막·제목 스타일, 주목 컷에 GIPHY 스티커) → 렌더.
 * 상태는 Storage JSON ({owner}/auto/…) — DB 변경 없음. 관리자 공용 데이터라 모든 관리자가 본다.
 * 비용: AI 글 약 4~5회 + 음성(TTS) + YouTube 검색 API(무료 한도). 샤오홍슈 TikHub 대체 경로는 쓰지 않는다.
 */
export const AUTO_LIMITS = { maxCount: 10, minVideos: 2, repeatDays: 7, staleMs: 14 * 60 * 1000 } as const;
const FEATURE = "yt-product-video";

export interface AutoVideoSettings {
  enabled: boolean;
  count: number;
  /** 원고 길이 (15s · 30s) */
  length: "15s" | "30s";
  updatedAt: string | null;
  updatedBy: string | null;
}
export const DEFAULT_AUTO_SETTINGS: AutoVideoSettings = { enabled: false, count: 3, length: "30s", updatedAt: null, updatedBy: null };

export type AutoItemStatus = "pending" | "running" | "done" | "failed" | "skipped";
export interface AutoItem {
  id: string;
  productId: string;
  productName: string;
  keyword: string;
  reason: string;
  status: AutoItemStatus;
  /** v0.9.111: 새벽 자동(schedule) / [지금 시험 실행](test) — 서로 영향을 주지 않는다 */
  source?: "schedule" | "test";
  /** 고를 때 연결돼 있던 샤오홍슈 영상 수 */
  videos?: number;
  step?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  stage1Id?: string | null;
  contentId?: string | null;
  jobId?: string | null;
  videoKey?: string | null;
  title?: string | null;
  description?: string | null;
  keywords?: string[];
  tags?: string[];
  jobStatus?: string | null;
  issues?: string[];
  publicationId?: string | null;
}
export interface AutoRun {
  date: string;
  createdAt: string;
  /** v0.9.111: 이날 새벽 자동 실행(05:00)이 제품을 골랐는가 — 시험 실행만 있었으면 false */
  scheduledAt?: string | null;
  items: AutoItem[];
  note?: string | null;
}

const now = () => new Date().toISOString();
/** 한국 날짜 (YYYY-MM-DD) */
export const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const dir = (owner: string) => `${owner}/auto`;
const runKey = (owner: string, date: string) => `${dir(owner)}/runs/${date}.json`;

async function readJson<T>(key: string): Promise<T | null> {
  const buf = await videoStorage.download(key).catch(() => null);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}
const writeJson = (key: string, v: unknown) => videoStorage.put(key, Buffer.from(JSON.stringify(v)), "application/json", "0");

export async function readSettings(): Promise<AutoVideoSettings> {
  const owner = await getCurrentUserId();
  return { ...DEFAULT_AUTO_SETTINGS, ...((await readJson<AutoVideoSettings>(`${dir(owner)}/settings.json`)) ?? {}) };
}
export async function saveSettings(v: Partial<AutoVideoSettings>, by: string): Promise<AutoVideoSettings> {
  const owner = await getCurrentUserId();
  const cur = await readSettings();
  const next: AutoVideoSettings = {
    enabled: v.enabled ?? cur.enabled,
    count: Math.min(AUTO_LIMITS.maxCount, Math.max(1, Math.round(Number(v.count ?? cur.count) || 1))),
    length: v.length === "15s" ? "15s" : v.length === "30s" ? "30s" : cur.length,
    updatedAt: now(),
    updatedBy: by,
  };
  await writeJson(`${dir(owner)}/settings.json`, next);
  return next;
}

export async function readRun(date: string): Promise<AutoRun | null> {
  const owner = await getCurrentUserId();
  return readJson<AutoRun>(runKey(owner, date));
}
async function saveRun(run: AutoRun): Promise<void> {
  const owner = await getCurrentUserId();
  await writeJson(runKey(owner, run.date), run);
}
/** 최근 실행 날짜들 (새 것부터) */
export async function listRuns(limit = 14): Promise<string[]> {
  const owner = await getCurrentUserId();
  const rows = await videoStorage.list(`${dir(owner)}/runs`, { desc: true, limit: 60 }).catch(() => []);
  return rows
    .map((r) => r.key.split("/").pop()!.replace(/\.json$/, ""))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse()
    .slice(0, limit);
}

/** 같은 실행 파일을 다시 읽어 그 항목만 바꿔 저장 (동시에 고친 다른 항목을 덮어쓰지 않게) */
async function patchItem(date: string, id: string, patch: Partial<AutoItem>): Promise<AutoRun | null> {
  const run = await readRun(date);
  if (!run) return null;
  run.items = run.items.map((x) => (x.id === id ? { ...x, ...patch } : x));
  await saveRun(run);
  return run;
}

/* ───── 1) 제품 고르기 ───── */
async function recentProductIds(owner: string): Promise<Set<string>> {
  const since = Date.now() - AUTO_LIMITS.repeatDays * 86400_000;
  const contents = await getRepositories().contents.list((c) => c.userId === owner && c.featureId === FEATURE && Date.parse(c.createdAt) >= since);
  return new Set(contents.map((c) => c.productId).filter((x): x is string => Boolean(x)));
}

interface Candidate {
  id: string;
  name: string;
  oneLiner: string;
  videos: number;
  keywords: { keyword: string; trend: string }[];
}

/**
 * 제품에 연결된 샤오홍슈 영상 중 '쓸 수 있는' 영상 수 (v0.9.113) — 영구 공유 링크(xhslink) 또는 7일 임시 캐시에 원본이 있는 영상.
 * 열쇠가 만료되는 긴 주소뿐인 영상은 쓰지 않는다 (TikHub 없이는 받을 수 없어 실패하므로)
 */
async function linkedVideoCount(owner: string): Promise<Map<string, number>> {
  const ids = await usableVideoIds(owner);
  const m = new Map<string, number>();
  for (const [pid, list] of ids) m.set(pid, list.length);
  return m;
}
async function usableVideoIds(owner: string): Promise<Map<string, string[]>> {
  const [videos, stored] = await Promise.all([getRepositories().videos.list((v) => v.userId === owner && v.platform === "xiaohongshu" && Boolean(v.productId)), storedVideoIds(owner)]);
  const m = new Map<string, string[]>();
  for (const v of videos) if (usableXhsVideo(v, stored)) m.set(v.productId!, [...(m.get(v.productId!) ?? []), v.id]);
  return m;
}

/** 화면 안내: 전체 제품 중 만들 수 있는 제품 수 (외부 호출 없음) */
export async function eligibility(): Promise<{ total: number; eligible: number; noVideo: number; fewVideo: number; recent: number }> {
  const owner = await getCurrentUserId();
  const [products, count, recent] = await Promise.all([productService.list(), linkedVideoCount(owner), recentProductIds(owner)]);
  let noVideo = 0;
  let fewVideo = 0;
  let rec = 0;
  let eligible = 0;
  for (const p of products) {
    const n = count.get(p.id) ?? 0;
    if (!n) noVideo++;
    else if (n < AUTO_LIMITS.minVideos) fewVideo++;
    else if (recent.has(p.id)) rec++;
    else eligible++;
  }
  return { total: products.length, eligible, noVideo, fewVideo, recent: rec };
}

export async function chooseProducts(count: number, exclude: Set<string> = new Set()): Promise<{ picks: { productId: string; productName: string; keyword: string; reason: string; videos: number }[]; note: string | null; aiCalls: number }> {
  const owner = await getCurrentUserId();
  const [products, videoCount, recent] = await Promise.all([productService.list(), linkedVideoCount(owner), recentProductIds(owner)]);
  const pool = products.filter((p) => (videoCount.get(p.id) ?? 0) >= AUTO_LIMITS.minVideos && !recent.has(p.id) && !exclude.has(p.id));
  if (!pool.length) return { picks: [], note: `만들 수 있는 제품이 없습니다 (공유 링크 xhslink 인 샤오홍슈 영상 ${AUTO_LIMITS.minVideos}개 이상 + 최근 ${AUTO_LIMITS.repeatDays}일 안에 만들지 않은 제품). 제품 상세 › 연결된 영상에서 [공유 링크로 바꾸기]를 해 주세요.`, aiCalls: 0 };
  const cands: Candidate[] = [];
  for (const p of pool.slice(0, 40)) {
    // v0.9.115: 제품 분석을 볼 수 없는 제품은 고르지 않는다 (원고를 만들다 '제품 분석 데이터가 없습니다'로 실패하지 않게)
    const ok = await productService.getDetail(p.id).then(() => true).catch(() => false);
    if (!ok) continue;
    cands.push({ id: p.id, name: p.name, oneLiner: p.oneLiner, videos: videoCount.get(p.id) ?? 0, keywords: (await keywordLibrary.suggest(p.id).catch(() => [])).slice(0, 6) });
  }
  if (!cands.length) return { picks: [], note: "만들 수 있는 제품이 없습니다 (조건에 맞는 제품의 분석 데이터를 볼 수 없습니다 — 제품 상세가 열리는지 확인해 주세요).", aiCalls: 0 };
  const n = Math.min(count, cands.length);
  const ai = await getAIProvider();
  const fallback = () =>
    [...cands]
      .sort((a, b) => b.keywords.filter((k) => k.trend === "up" || k.trend === "new").length - a.keywords.filter((k) => k.trend === "up" || k.trend === "new").length || b.videos - a.videos)
      .slice(0, n)
      .map((c) => ({ productId: c.id, productName: c.name, keyword: c.keywords[0]?.keyword ?? c.name, reason: "키워드 추이·연결 영상 수 기준", videos: c.videos }));
  if (ai.id === "mock") return { picks: fallback(), note: pool.length < count ? `조건에 맞는 제품이 ${pool.length}개뿐입니다.` : null, aiCalls: 0 };
  try {
    const { data } = await ai.generateStructured<{ picks: { index: number; keyword: string; reason: string }[] }>({
      task: "auto-video:choose",
      messages: [
        { role: "system", content: "당신은 한국 YouTube 쇼츠 제품 홍보 채널의 편성 담당자다. 오늘 영상으로 만들 제품을 고른다. 요즘 검색이 오르는(up·new) 키워드가 있는 제품, 연결된 영상 소재가 넉넉한 제품을 우선하고, 서로 다른 제품을 고른다. 답은 JSON 객체 하나로만." },
        {
          role: "user",
          content: `[후보]\n${cands.map((c, i) => `${i + 1}. ${c.name} — ${c.oneLiner || ""} · 영상 ${c.videos}개 · 키워드 ${c.keywords.map((k) => `${k.keyword}(${k.trend})`).join(", ") || "없음"}`).join("\n")}\n\n${n}개를 고른다. 각각 index(후보 번호), keyword(이 제품 영상의 주요 검색 키워드 1개 — 후보 키워드 중에서, 없으면 제품을 찾을 때 쓸 말), reason(한 줄). 형식: {"picks":[{"index":1,"keyword":"…","reason":"…"}]}`,
        },
      ],
      outputKeys: ["picks"],
      jsonSchema: { type: "object", additionalProperties: false, required: ["picks"], properties: { picks: { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "keyword", "reason"], properties: { index: { type: "integer" }, keyword: { type: "string" }, reason: { type: "string" } } } } } },
      variables: {},
      maxTokens: 1500,
    });
    const seen = new Set<string>();
    const picks = (data.picks ?? [])
      .map((x) => ({ c: cands[Number(x.index) - 1], keyword: String(x.keyword ?? "").slice(0, 40), reason: String(x.reason ?? "").slice(0, 120) }))
      .filter((x) => x.c && !seen.has(x.c.id) && seen.add(x.c.id))
      .slice(0, n)
      .map((x) => ({ productId: x.c.id, productName: x.c.name, keyword: x.keyword || x.c.keywords[0]?.keyword || x.c.name, reason: x.reason, videos: x.c.videos }));
    return { picks: picks.length ? picks : fallback(), note: pool.length < count ? `조건에 맞는 제품이 ${pool.length}개뿐입니다.` : null, aiCalls: 1 };
  } catch {
    return { picks: fallback(), note: "AI 가 제품을 고르지 못해 키워드 추이 순으로 골랐습니다.", aiCalls: 0 };
  }
}

/**
 * 오늘 실행 만들기.
 * - source "schedule"(새벽 05:00): 이날 새벽 자동이 아직 안 골랐으면 설정한 개수를 고른다. [지금 시험 실행]으로 생긴 항목이 먼저 있어도 따로 더한다
 *   (시험 실행 때문에 새벽 자동이 건너뛰어지지 않게). 이미 골랐으면 그대로 (크론이 두 번 불려도 한 번만)
 * - source "test"([지금 시험 실행]): 실행이 없을 때만 새로 만든다
 */
export async function startRun(date = kstDate(), countOverride?: number, source: "schedule" | "test" = "schedule"): Promise<AutoRun> {
  const existing = await readRun(date);
  if (existing && (source === "test" || existing.scheduledAt)) return existing;
  const settings = await readSettings();
  const count = countOverride ?? settings.count;
  const base: AutoRun = existing ?? { date, createdAt: now(), items: [], note: null, scheduledAt: null };
  const { picks, note } = await chooseProducts(count, new Set(base.items.map((x) => x.productId)));
  const start = base.items.length;
  const run: AutoRun = {
    ...base,
    note,
    scheduledAt: source === "schedule" ? now() : (base.scheduledAt ?? null),
    items: [...base.items, ...picks.map((x, i) => ({ id: `ai_${date.replace(/-/g, "")}_${start + i + 1}`, ...x, source, status: "pending" as const }))],
  };
  await saveRun(run);
  console.info("[AutoVideo] start", JSON.stringify({ date, source, added: picks.length, total: run.items.length, note }));
  return run;
}

/**
 * v0.9.110 [지금 시험 실행]은 언제든: 오늘 실행에 남은 항목이 없으면 새 제품을 골라 덧붙인다
 * (오늘 이미 고른 제품·최근 7일 안에 만든 제품은 빼고, 샤오홍슈 영상 연결 조건 그대로)
 */
export async function addItems(date: string, count: number, source: "schedule" | "test" = "test"): Promise<AutoRun> {
  const run: AutoRun = (await readRun(date)) ?? { date, createdAt: now(), items: [], note: null, scheduledAt: null };
  const { picks, note } = await chooseProducts(count, new Set(run.items.map((x) => x.productId)));
  if (!picks.length) throw new AppError("NO_PRODUCT", note ?? "지금 만들 수 있는 제품이 없습니다.", 409);
  const start = run.items.length;
  run.items.push(...picks.map((x, i) => ({ id: `ai_${date.replace(/-/g, "")}_${start + i + 1}`, ...x, source, status: "pending" as const })));
  run.note = note;
  await saveRun(run);
  return run;
}

/* ───── 2) 1개 만들기 ───── */
/** AI 가 후보 중 가장 좋은 것 고르기 (1회). 실패하면 첫 번째 */
async function pickBest(task: string, question: string, lists: Record<string, string[]>): Promise<Record<string, number>> {
  const ai = await getAIProvider();
  const keys = Object.keys(lists).filter((k) => lists[k].length > 1);
  const zero = Object.fromEntries(Object.keys(lists).map((k) => [k, 0]));
  if (ai.id === "mock" || !keys.length) return zero;
  try {
    const { data } = await ai.generateStructured<Record<string, number>>({
      task: `auto-video:${task}`,
      messages: [
        { role: "system", content: "당신은 한국 YouTube 쇼츠 제품 홍보 영상 편집장이다. 후보 중 시청 지속·클릭·구매 전환에 가장 좋은 것을 하나씩 고른다. 답은 JSON 객체 하나로만, 각 항목은 1부터 센 번호." },
        { role: "user", content: `${question}\n\n${keys.map((k) => `[${k}]\n${lists[k].map((v, i) => `${i + 1}. ${v.slice(0, 600)}`).join("\n")}`).join("\n\n")}\n\n형식: {${keys.map((k) => `"${k}":1`).join(",")}}` },
      ],
      outputKeys: keys,
      jsonSchema: { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((k) => [k, { type: "integer" }])) },
      variables: {},
      maxTokens: 300,
    });
    return Object.fromEntries(Object.keys(lists).map((k) => {
      const n = Math.round(Number(data[k])) - 1;
      return [k, n >= 0 && n < lists[k].length ? n : 0];
    }));
  } catch {
    return zero;
  }
}

/** 가장 최근에 직접 만든(자동이 아닌) 영상의 목소리·자막·제목 스타일 */
async function lastVoiceSettings(owner: string): Promise<Partial<VideoPlan>> {
  const jobs = await getRepositories().videoJobs.list((j) => j.userId === owner && j.channelId === "youtube" && (j.status === "completed" || j.status === "needs_review"));
  const last = jobs.filter((j) => !(j.plan as VideoPlan & { auto?: boolean }).auto).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!last) return {};
  const p = last.plan;
  return { voice: p.voice, ttsEngine: p.ttsEngine, ttsEmotion: p.ttsEmotion, voiceStyle: p.voiceStyle, voiceSpeed: p.voiceSpeed, maxPauseSec: p.maxPauseSec, captionStyle: p.captionStyle, titleStyle: p.titleStyle, narrationOn: p.narrationOn, captions: p.captions };
}

const GIF_WORDS = ["wow", "omg", "yes", "fire", "check", "sparkle", "clap", "love"];

/** 주목 컷마다 GIPHY 스티커 (연결돼 있을 때만, 무료) */
async function addGifs(plan: VideoPlan): Promise<void> {
  const g = await getGiphyProvider().catch(() => null);
  if (!g) return;
  let k = 0;
  for (const s of plan.scenes) {
    if (!s.attention) continue;
    const list = await g.search(GIF_WORDS[k % GIF_WORDS.length], "stickers", 8).catch(() => []);
    const it = list[(k * 3) % Math.max(1, list.length)];
    if (it) s.gif = { id: it.id, url: it.url, preview: it.preview, title: it.title };
    k++;
  }
}

/** 하나 만들기: 단계마다 실행 파일에 진행 상황을 남긴다. 실패해도 다음 항목은 계속 */
export async function produceItem(date: string, itemId: string): Promise<AutoItem> {
  const owner = await getCurrentUserId();
  const settings = await readSettings();
  const run = await readRun(date);
  const item = run?.items.find((x) => x.id === itemId);
  if (!run || !item) throw new AppError("NOT_FOUND", "자동 제작 항목을 찾지 못했습니다.", 404);
  const step = async (s: string, extra: Partial<AutoItem> = {}) => void (await patchItem(date, itemId, { step: s, ...extra }));
  // v0.9.110: 샤오홍슈 영상이 연결되지 않은 제품은 만들지 않는다 (고른 뒤 연결이 풀렸어도 — AI·음성 비용 없음)
  const linked = (await linkedVideoCount(owner)).get(item.productId) ?? 0;
  if (linked < AUTO_LIMITS.minVideos) {
    const r = await patchItem(date, itemId, { status: "skipped", videos: linked, step: "건너뜀", error: `쓸 수 있는 샤오홍슈 영상(공유 링크 xhslink)이 ${linked}개뿐이라 만들지 않았습니다 (${AUTO_LIMITS.minVideos}개 이상 필요 — 제품 상세 › 연결된 영상에서 [공유 링크로 바꾸기]).`, finishedAt: now() });
    return r!.items.find((x) => x.id === itemId)!;
  }
  await step("원고 1단계 (키워드 분석·제목 후보)", { status: "running", startedAt: now(), error: null });
  const t0 = Date.now();
  try {
    const s1 = (await contentGenerationService.stage1({ featureId: FEATURE, input: { productId: item.productId, keywords: item.keyword, length: settings.length } } as Parameters<typeof contentGenerationService.stage1>[0])) as GeneratedContent;
    const out1 = s1.output as Record<string, unknown>;
    const titles = (Array.isArray(out1.titles) ? out1.titles : []).map(String);
    const top = (s1.context.quality?.titleTop ?? []).map((t) => t.title).filter(Boolean);
    const hooks = (Array.isArray(out1.hooks) ? out1.hooks : []).map(String);
    const ctas = (Array.isArray(out1.ctas) ? out1.ctas : []).map(String);
    await step("AI 가 제목·Hook·CTA 고르는 중", { stage1Id: s1.id });
    const pick1 = await pickBest("pick1", "이 제품 쇼츠에 쓸 제목·첫 문장(Hook)·마무리(CTA)를 하나씩 고른다.", { title: top.length ? top : titles.slice(0, 5), hook: hooks.slice(0, 10), cta: ctas.slice(0, 10) });
    const title = (top.length ? top : titles)[pick1.title] ?? titles[0];
    if (!title) throw new Error("제목 후보를 만들지 못했습니다.");
    await step("원고 2단계 (대본 3편·설명·태그)");
    const s2 = (await contentGenerationService.stage2({ stage1Id: s1.id, title, hook: hooks[pick1.hook] ?? "", cta: ctas[pick1.cta] ?? "" })) as GeneratedContent;
    const scripts = (Array.isArray(s2.output.script) ? s2.output.script : []).map(String);
    await step("AI 가 대본 고르는 중", { contentId: s2.id, title });
    const pick2 = await pickBest("pick2", `제목 '${title}' 에 가장 잘 맞고 끝까지 보게 만드는 대본을 고른다.`, { script: scripts });
    await step("컷 계획 (샤오홍슈 영상 매칭·주목 효과·GIF)");
    const voice = await lastVoiceSettings(owner);
    // 보관 파일이 있는 영상만 (링크가 만료돼도 그 파일로)
    const videoIds = (await usableVideoIds(owner)).get(item.productId) ?? [];
    const { plan } = await videoJobService.plan({ contentId: s2.id, scriptIndex: pick2.script, channelId: "youtube", sourceMode: "xhs", videoIds, ...voice });
    await addGifs(plan);
    (plan as VideoPlan & { auto?: boolean }).auto = true;
    await step("영상 만드는 중 (음성·자막·컷 편집)");
    const job = await videoJobService.create({ plan });
    await patchItem(date, itemId, { jobId: job.id });
    await videoJobService.run(job.id);
    const done = (await getRepositories().videoJobs.get(job.id)) as VideoJob | null;
    if (!done || done.status === "failed" || !done.outputPath) throw new Error(done?.error || "영상을 만들지 못했습니다.");
    const out2 = s2.output as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
    const finished = await patchItem(date, itemId, {
      status: "done",
      step: done.status === "needs_review" ? "완료 (확인 필요한 컷 있음)" : "완료",
      finishedAt: now(),
      videoKey: done.outputPath,
      jobStatus: done.status,
      issues: done.qa?.issues ?? [],
      title: done.plan.selectedTitle || title,
      description: String(out2.description ?? "").slice(0, 5000),
      keywords: list(out2.keywords).slice(0, 30),
      tags: list(out2.tags).slice(0, 30),
    });
    console.info("[AutoVideo] done", JSON.stringify({ date, item: itemId, product: item.productId, ms: Date.now() - t0 }));
    return finished!.items.find((x) => x.id === itemId)!;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    console.error("[AutoVideo] fail", JSON.stringify({ date, item: itemId, error: msg }));
    const r = await patchItem(date, itemId, { status: "failed", error: msg, finishedAt: now() });
    return r!.items.find((x) => x.id === itemId)!;
  }
}

/** 5분마다: 진행 중인 것이 없으면 다음 1개를 만든다. 오래 멈춘 것은 실패로 */
export async function tick(date = kstDate(), source?: "schedule" | "test"): Promise<{ did: string | null; left: number }> {
  const run = await readRun(date);
  if (!run) return { did: null, left: 0 };
  const running = run.items.find((x) => x.status === "running");
  if (running) {
    if (Date.now() - Date.parse(running.startedAt ?? run.createdAt) < AUTO_LIMITS.staleMs) return { did: null, left: run.items.filter((x) => x.status === "pending").length };
    await patchItem(date, running.id, { status: "failed", error: "시간 안에 끝나지 않았습니다 (다음 항목으로 넘어감).", finishedAt: now() });
  }
  const pending = run.items.filter((x) => x.status === "pending");
  // 새벽: 새벽 자동 항목 먼저 / 시험: 시험 항목 먼저 (없으면 남은 것)
  // 구분값이 없는 예전 항목은 시험 실행으로 본다 (v0.9.111 전에는 새벽 자동이 돈 적이 없음)
  const next = pending.find((x) => (x.source ?? "test") === (source ?? "schedule")) ?? pending[0];
  if (!next) return { did: null, left: 0 };
  await produceItem(date, next.id);
  const after = await readRun(date);
  return { did: next.id, left: after?.items.filter((x) => x.status === "pending").length ?? 0 };
}

/** 보고 화면용: 영상 보기 주소 */
export async function videoUrls(run: AutoRun | null): Promise<Record<string, string>> {
  const keys = (run?.items ?? []).map((x) => x.videoKey).filter((k): k is string => Boolean(k));
  return keys.length ? videoStorage.urls(keys, 3600).catch(() => ({})) : {};
}

/** v0.9.115 결과 지우기: 항목 하나(itemId) 또는 그날 전체. 완성 영상 파일도 지운다 (원고·업로드 예약은 그대로). 만드는 중인 항목은 지우지 않는다 */
export async function removeItems(date: string, itemId?: string): Promise<{ removed: number; run: AutoRun | null }> {
  const owner = await getCurrentUserId();
  const run = await readRun(date);
  if (!run) throw new AppError("NOT_FOUND", "그날 결과가 없습니다.", 404);
  const targets = run.items.filter((x) => (itemId ? x.id === itemId : true) && x.status !== "running");
  if (!targets.length) throw new AppError("VALIDATION", itemId ? "지울 수 없는 항목입니다 (만드는 중이면 끝난 뒤 지워 주세요)." : "지울 항목이 없습니다.");
  for (const t of targets) if (t.videoKey) await videoStorage.remove(t.videoKey).catch(() => undefined);
  const left = run.items.filter((x) => !targets.includes(x));
  if (!left.length && !itemId) {
    await videoStorage.remove(runKey(owner, date)).catch(() => undefined);
    return { removed: targets.length, run: null };
  }
  const next = { ...run, items: left };
  await saveRun(next);
  return { removed: targets.length, run: next };
}

export { patchItem };
