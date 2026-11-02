import "server-only";
import { KIND_LABEL, featureTable, median, openingOf, standouts, type AnalyticsVideo, type FeatureRow, type VideoKind } from "@/lib/domain/analytics";
import type { VideoJob } from "@/lib/types/video-production";
import { videoStorage } from "../video/storage";
import { getAIProvider, getYouTubeTrendProvider } from "../providers/registry";
import { extractYouTubeId } from "../providers/trends/youtube-data-api-provider";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { scriptFormatService } from "./script-formats";
import { isYouTubePublication } from "./youtube-stats";
import { youtubeChannelService } from "./youtube-channel";
import { nowIso } from "@/lib/utils";

/**
 * 성과 분석 (v0.9.151) — 유튜브 먼저. 인스타그램은 내 계정 성과 권한(Meta 인사이트)이 생기면, 클립·블로그는 나중에.
 * - 내 영상 = 업로드 관리에 유튜브 주소가 있는 기록. 영상 정보(길이·게시 시각·조회수)는 50개당 1 unit (무료 할당량)
 * - 같은 사람은 30분 기억 ([새로 불러오기]로 다시)
 * - AI 는 버튼을 누를 때만 1번 (가설 찾기 · 차이 가설 · 훅 분석). 자동 재시도 없음
 * - 올린 지 48시간이 안 된 영상은 조회수가 아직 덜 쌓여 패턴 계산에서 뺀다
 * - v0.9.152 Hook = 첫 3초에 나오는 말 (완성 영상 컷 대사·시작 시각). 넓게·좁게·실험 구분은 {owner}/analytics/youtube-kinds.json (DB 변경 없음)
 */
const TTL = 30 * 60 * 1000;
const FRESH_MS = 48 * 3_600_000;
const cache = new Map<string, { at: number; value: MyVideos }>();

export interface MyVideos {
  videos: AnalyticsVideo[];
  /** 패턴 계산에 쓴 영상 (48시간 지난 것) */
  counted: number;
  overallMedian: number;
  rows: FeatureRow[];
  standouts: FeatureRow[];
  /** 업로드 관리에 유튜브 주소가 없어 분석에 못 넣은 업로드 수 */
  missingUrl: number;
  at: string;
}

export interface CompareVideo {
  title: string;
  url: string;
  views: number | null;
  durationSec: number;
  publishedAt: string;
  thumbnailUrl: string | null;
}

type KindMap = Record<string, { kind: VideoKind; by: "me" | "ai" }>;
const kindsKey = (owner: string) => `${owner}/analytics/youtube-kinds.json`;
async function readKinds(owner: string): Promise<KindMap> {
  const buf = await videoStorage.download(kindsKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as KindMap) : {};
  } catch {
    return {};
  }
}
async function writeKinds(owner: string, map: KindMap) {
  await videoStorage.put(kindsKey(owner), Buffer.from(JSON.stringify(map)), "application/json", "0");
}

/** 캐시된 숫자 + 지금 구분(넓게·좁게·실험)을 붙여 표를 다시 계산 */
async function myVideos(force = false): Promise<MyVideos> {
  const owner = await getCurrentUserId();
  const base = await loadVideos(owner, force);
  const kinds = await readKinds(owner);
  const videos = base.videos.map((v) => ({ ...v, kind: kinds[v.videoId]?.kind ?? null, kindBy: kinds[v.videoId]?.by ?? null }));
  const ripe = videos.filter((v) => Date.parse(base.at) - Date.parse(v.publishedAt) >= FRESH_MS);
  const table = featureTable(ripe);
  return { ...base, videos, rows: table.rows, standouts: standouts(table.rows) };
}

async function loadVideos(owner: string, force: boolean): Promise<MyVideos> {
  const hit = cache.get(owner);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.value;
  const repo = getRepositories();
  const pubs = await repo.publications.list((p) => p.platform === "youtube" || /youtu/.test(p.platformUrl ?? ""));
  const done = pubs.filter((p) => p.status === "published" || (p.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) <= Date.now()));
  const yt = done.filter(isYouTubePublication);
  const byVideo = new Map(yt.map((p) => [extractYouTubeId(p.platformUrl!)!, p]));
  const ids = [...byVideo.keys()].slice(0, 200);
  const provider = await getYouTubeTrendProvider();
  const details = (await Promise.all(Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => provider.getVideoDetails(ids.slice(i * 50, i * 50 + 50))))).flat();
  // 우리 시스템에서 만든 콘텐츠면 Hook·섬네일 제목·포맷을 붙인다
  const contentIds = [...new Set(yt.map((p) => p.contentId).filter(Boolean) as string[])];
  const contents = contentIds.length ? await repo.contents.list((c) => contentIds.includes(c.id), { id: contentIds }).catch(() => []) : [];
  const contentById = new Map(contents.map((c) => [c.id, c]));
  // 첫 3초 말: 그 콘텐츠로 만든 완성 영상의 컷 대사 (가장 최근 것)
  const jobs = contentIds.length
    ? ((await repo.videoJobs.list((j) => Boolean(j.contentId && contentIds.includes(j.contentId)), { contentId: contentIds }).catch(() => [])) as VideoJob[])
    : [];
  const jobByContent = new Map<string, VideoJob>();
  for (const j of jobs.filter((x) => ["completed", "needs_review", "approved"].includes(x.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) jobByContent.set(j.contentId!, j);
  const videos: AnalyticsVideo[] = details.map((d) => {
    const pub = byVideo.get(d.videoId);
    const c = pub?.contentId ? contentById.get(pub.contentId) : undefined;
    const sel = c?.context.workflow?.selected;
    const job = pub?.contentId ? jobByContent.get(pub.contentId) : undefined;
    const screenTitle = job ? [job.plan.topLine1, job.plan.topLine2].filter(Boolean).join(" ").trim() || null : null;
    return {
      videoId: d.videoId,
      url: d.url,
      title: d.title,
      publishedAt: d.publishedAt,
      durationSec: d.durationSec,
      views: d.views,
      likes: d.likes,
      comments: d.comments,
      thumbnailUrl: d.thumbnailUrl,
      contentId: pub?.contentId ?? null,
      hook: (job ? openingOf(job.plan.scenes ?? []) : null) ?? (sel?.hook || null),
      screenTitle,
      kind: null,
      kindBy: null,
      thumbTitle: c?.context.picks?.thumbnailTitles?.values?.[0] ?? null,
      formatName: c?.context.scriptFormat?.name ?? null,
      productName: pub?.productName || null,
    };
  });
  videos.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const ripe = videos.filter((v) => Date.now() - Date.parse(v.publishedAt) >= FRESH_MS);
  const table = featureTable(ripe);
  const value: MyVideos = {
    videos,
    counted: ripe.length,
    overallMedian: table.overallMedian,
    rows: table.rows,
    standouts: standouts(table.rows),
    missingUrl: done.filter((p) => !isYouTubePublication(p)).length,
    at: nowIso(),
  };
  console.info("[Analytics] my videos", JSON.stringify({ videos: videos.length, counted: ripe.length, units: Math.ceil(ids.length / 50) }));
  cache.set(owner, { at: Date.now(), value });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return value;
}

const line = (v: { title: string; views: number | null; durationSec: number; hook?: string | null; thumbTitle?: string | null }) =>
  [`"${v.title}"`, `조회 ${v.views ?? "?"}`, `${v.durationSec}초`, v.hook ? `첫 3초: ${v.hook}` : "", v.thumbTitle ? `섬네일: ${v.thumbTitle}` : ""].filter(Boolean).join(" · ");

const SYSTEM = "당신은 한국 YouTube 쇼츠 제품 홍보 채널의 데이터 분석가다. 숫자로 확인된 것만 근거로 쓰고, 표본이 적으면 그렇다고 말한다. 조회수보다 문의·구매(매출)로 이어지는지를 함께 본다. 답은 JSON 객체 하나로만, 모든 문장은 존댓말 한국어.";

async function aiJson<T extends Record<string, unknown>>(task: string, user: string, schema: Record<string, unknown>, key: string, maxTokens = 1800): Promise<T> {
  const ai = await getAIProvider();
  const { data } = await ai.generateStructured<T>({
    task: `analytics:${task}`,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    outputKeys: [key],
    jsonSchema: schema,
    variables: {},
    maxTokens,
  });
  return data;
}

const arrOf = (props: Record<string, unknown>) => ({ type: "array", items: { type: "object", additionalProperties: false, required: Object.keys(props), properties: props } });
const STR = { type: "string" };

export const analyticsService = {
  myVideos,

  /** ② 패턴 찾기 — AI 가설 (누를 때 1번) */
  async hypotheses(): Promise<{ hypotheses: { title: string; evidence: string; test: string }[] }> {
    const mine = await myVideos();
    if (mine.counted < 5) throw new AppError("VALIDATION", "올린 지 2일 지난 유튜브 영상이 5개 이상 있어야 가설을 찾을 수 있습니다. 업로드 관리에 유튜브 주소를 넣어 주세요.");
    const ripe = mine.videos.filter((v) => Date.now() - Date.parse(v.publishedAt) >= FRESH_MS);
    const table = mine.rows.map((r) => `${r.group} | ${r.label} | n=${r.n} | ×${r.ratio}${r.few ? " (표본 적음)" : ""}`).join("\n");
    const user = `내 채널 영상 ${mine.counted}개, 전체 조회수 중앙값 ${mine.overallMedian}.

[특징별 배수 (그 특징 영상의 조회수 중앙값 ÷ 전체 중앙값)]
${table}

[잘된 영상 TOP 8]
${ripe.slice(0, 8).map(line).join("\n")}

[안 된 영상 8]
${ripe.slice(-8).map(line).join("\n")}

다음 영상에서 시험해 볼 가설 3~5개를 만들어 주세요. 각 가설: title(한 줄 가설), evidence(위 숫자 중 근거, n 포함), test(다음 주 7개 중 '실험' 1개로 어떻게 시험할지 구체적으로).
형식: {"hypotheses":[{"title":"","evidence":"","test":""}]}`;
    const ai = await getAIProvider();
    if (ai.id === "mock") return { hypotheses: mine.standouts.slice(0, 3).map((r) => ({ title: `${r.group}: '${r.label}' 일 때 조회수가 ${r.ratio}배`, evidence: `n=${r.n}, 중앙값 ${r.medianViews}회 (전체 ${mine.overallMedian}회)`, test: `다음 주 실험 1개를 '${r.label}' 로 만들어 같은 시간대에 올려 봅니다.` })) };
    const data = await aiJson<{ hypotheses: { title: string; evidence: string; test: string }[] }>("hypotheses", user, { type: "object", additionalProperties: false, required: ["hypotheses"], properties: { hypotheses: arrOf({ title: STR, evidence: STR, test: STR }) } }, "hypotheses");
    return { hypotheses: (data.hypotheses ?? []).slice(0, 5) };
  },

  /** ③ 경쟁 비교 — 경쟁 채널(주소·@핸들) 또는 영상 주소들 → 그쪽 잘된 5개 vs 내 잘된 5개 */
  async competitor(input: { channel?: unknown; urls?: unknown }): Promise<{ channelTitle: string | null; theirs: CompareVideo[]; mine: CompareVideo[] }> {
    const provider = await getYouTubeTrendProvider();
    let theirs: CompareVideo[] = [];
    let channelTitle: string | null = null;
    const channel = String(input.channel ?? "").trim();
    const urls = (Array.isArray(input.urls) ? input.urls : String(input.urls ?? "").split(/\s+/)).map(String).filter(Boolean).slice(0, 20);
    if (channel) {
      const id = await provider.resolveChannelId(channel);
      if (!id) throw new AppError("VALIDATION", "채널을 찾지 못했습니다. 채널 주소(youtube.com/@이름) 나 @핸들을 넣어 주세요.");
      const ins = await youtubeChannelService.insight({ channelId: id });
      channelTitle = ins.channel.title;
      const shorts = ins.videos.filter((v) => v.format === "shorts");
      theirs = (shorts.length >= 5 ? shorts : ins.videos).slice().sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5);
    } else if (urls.length) {
      const ids = urls.map((u) => extractYouTubeId(u)).filter((x): x is string => Boolean(x));
      if (!ids.length) throw new AppError("VALIDATION", "유튜브 영상 주소를 확인해 주세요.");
      theirs = (await provider.getVideoDetails(ids)).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 10);
    } else throw new AppError("VALIDATION", "경쟁 채널 주소나 영상 주소를 넣어 주세요.");
    const mine = (await myVideos()).videos.slice(0, 5);
    const pick = (v: CompareVideo): CompareVideo => ({ title: v.title, url: v.url, views: v.views, durationSec: v.durationSec, publishedAt: v.publishedAt, thumbnailUrl: v.thumbnailUrl });
    return { channelTitle, theirs: theirs.map(pick), mine: mine.map(pick) };
  },

  /** ③ 차이 가설 (누를 때 1번) */
  async compareHypotheses(input: { theirs?: unknown; mine?: unknown }): Promise<{ differences: { point: string; theirs: string; mine: string; tryNext: string }[] }> {
    const list = (v: unknown) => (Array.isArray(v) ? (v as CompareVideo[]) : []).slice(0, 10);
    const theirs = list(input.theirs);
    const mine = list(input.mine);
    if (!theirs.length) throw new AppError("VALIDATION", "먼저 경쟁 영상을 불러와 주세요.");
    const ai = await getAIProvider();
    if (ai.id === "mock") return { differences: [{ point: "영상 길이", theirs: `평균 ${Math.round(median(theirs.map((v) => v.durationSec)))}초`, mine: `평균 ${Math.round(median(mine.map((v) => v.durationSec)))}초`, tryNext: "다음 실험 영상은 경쟁 채널 길이에 맞춰 봅니다." }] };
    const user = `[경쟁 채널 잘된 영상]
${theirs.map(line).join("\n")}

[내 잘된 영상]
${mine.map(line).join("\n") || "(아직 없음)"}

두 묶음의 차이를 3~5개 찾아 주세요: 제목 구조(숫자·질문·손실 회피), 첫 문장 약속, 길이, 주제 넓이(넓게/좁게), 섬네일 글. 각 항목: point(무엇이 다른가), theirs(경쟁 쪽 예), mine(내 쪽 예), tryNext(다음 영상에서 바로 시험할 것).
형식: {"differences":[{"point":"","theirs":"","mine":"","tryNext":""}]}`;
    const data = await aiJson<{ differences: { point: string; theirs: string; mine: string; tryNext: string }[] }>("compare", user, { type: "object", additionalProperties: false, required: ["differences"], properties: { differences: arrOf({ point: STR, theirs: STR, mine: STR, tryNext: STR }) } }, "differences");
    return { differences: (data.differences ?? []).slice(0, 5) };
  },

  /** ④ 훅 연구소 — 모을 Hook 후보 (내 영상 Hook·제목 + 경쟁 제목은 화면에서 붙여 넣기) */
  async hookSources(): Promise<{ hooks: { text: string; views: number | null; from: string }[]; missing: number }> {
    const mine = await myVideos();
    const hooks = mine.videos.filter((v) => v.hook).map((v) => ({ text: v.hook!, views: v.views, from: "내 영상 첫 3초" }));
    return { hooks: hooks.slice(0, 100), missing: mine.videos.length - hooks.length };
  },

  /** ④ 훅 분석 + 변형 10개 (누를 때 1번) */
  async hookLab(input: { hooks?: unknown; topic?: unknown }): Promise<{ structures: { name: string; formula: string; examples: string[]; share: string }[]; variants: { text: string; structure: string }[] }> {
    const hooks = (Array.isArray(input.hooks) ? input.hooks : String(input.hooks ?? "").split("\n")).map((h) => String(h).trim()).filter(Boolean).slice(0, 100);
    if (hooks.length < 3) throw new AppError("VALIDATION", "Hook 을 3개 이상 넣어 주세요 (한 줄에 하나, 최대 100개).");
    const topic = String(input.topic ?? "").trim().slice(0, 200);
    const ai = await getAIProvider();
    if (ai.id === "mock")
      return {
        structures: [{ name: "숫자 약속", formula: "[숫자] + [얻는 것]", examples: hooks.slice(0, 2), share: `${hooks.length}개 중 일부` }],
        variants: Array.from({ length: 10 }, (_, i) => ({ text: `${topic || "이 제품"}, 모르면 손해 보는 ${i + 1}가지`, structure: "숫자 약속" })),
      };
    const user = `[모은 Hook ${hooks.length}개 — 영상 첫 3초에 말하는 문장 (제목 아님). 조회수가 있으면 함께]
${hooks.map((h, i) => `${i + 1}. ${h.slice(0, 160)}`).join("\n")}

1) structures: 이 Hook 들을 구조로 묶어 주세요 (3~6개). 각: name(구조 이름), formula(빈칸 공식, 예: "[대상]이 [실수]하면 [손해]"), examples(위에서 2~3개 그대로), share(몇 개가 이 구조인지).
2) variants: ${topic ? `"${topic}" 주제로` : "같은 제품군 주제로"} 위 구조를 써서 영상 첫 3초에 말할 새 Hook 10개. 3초 안에 말할 수 있게 20자 안쪽, 스크롤을 멈추게, 존댓말, 과장·허위 금지. 각: text, structure(쓴 구조 이름).
형식: {"structures":[{"name":"","formula":"","examples":[""],"share":""}],"variants":[{"text":"","structure":""}]}`;
    const data = await aiJson<{ structures: { name: string; formula: string; examples: string[]; share: string }[]; variants: { text: string; structure: string }[] }>(
      "hooks",
      user,
      {
        type: "object",
        additionalProperties: false,
        required: ["structures", "variants"],
        properties: { structures: arrOf({ name: STR, formula: STR, examples: { type: "array", items: STR }, share: STR }), variants: arrOf({ text: STR, structure: STR }) },
      },
      "variants",
      2400,
    );
    return { structures: (data.structures ?? []).slice(0, 6), variants: (data.variants ?? []).slice(0, 10) };
  },

  /** 개요: 영상 구분 정하기 (넓게·좁게·실험, null = 지우기) */
  async setKind(input: { videoId?: unknown; kind?: unknown }): Promise<{ ok: true }> {
    const owner = await getCurrentUserId();
    const videoId = String(input.videoId ?? "");
    if (!/^[\w-]{6,20}$/.test(videoId)) throw new AppError("VALIDATION", "영상을 확인해 주세요.");
    const kind = input.kind == null || input.kind === "" ? null : String(input.kind);
    if (kind && !(kind in KIND_LABEL)) throw new AppError("VALIDATION", "구분은 넓게·좁게·실험 중에서 골라 주세요.");
    const map = await readKinds(owner);
    if (kind) map[videoId] = { kind: kind as VideoKind, by: "me" };
    else delete map[videoId];
    await writeKinds(owner, map);
    return { ok: true };
  },

  /** 개요: 아직 안 나눈 영상을 AI 가 넓게·좁게로 나눈다 (누를 때 1번. 실험은 사람이 정함) */
  async classify(): Promise<{ classified: number }> {
    const owner = await getCurrentUserId();
    const mine = await myVideos();
    const todo = mine.videos.filter((v) => !v.kind).slice(0, 60);
    if (!todo.length) return { classified: 0 };
    const ai = await getAIProvider();
    let result: { videoId: string; kind: "broad" | "narrow" }[];
    if (ai.id === "mock") result = todo.map((v, i) => ({ videoId: v.videoId, kind: i % 2 ? "narrow" : "broad" }));
    else {
      const user = `쇼츠 영상마다 주제 넓이를 나눠 주세요.
- broad(넓게): 제품을 살 생각이 없는 사람도 공감·클릭할 넓은 주제 (예: "여름 전기세 줄이는 법", "자취 꿀템 5가지")
- narrow(좁게): 이 제품을 살 사람·이미 고민하는 사람만 콕 집는 주제 (예: "원룸용 무선청소기 A vs B", "이 제습기 살 때 확인할 것")

${todo.map((v) => `${v.videoId} | 제목: ${v.title}${v.hook ? ` | 첫 3초: ${v.hook}` : ""}${v.productName ? ` | 제품: ${v.productName}` : ""}`).join("\n")}

형식: {"items":[{"videoId":"","kind":"broad"}]}`;
      const data = await aiJson<{ items: { videoId: string; kind: "broad" | "narrow" }[] }>(
        "classify",
        user,
        { type: "object", additionalProperties: false, required: ["items"], properties: { items: arrOf({ videoId: STR, kind: { type: "string", enum: ["broad", "narrow"] } }) } },
        "items",
        3000,
      );
      result = data.items ?? [];
    }
    const want = new Set(todo.map((v) => v.videoId));
    const map = await readKinds(owner);
    let n = 0;
    for (const r of result) {
      if (!want.has(r.videoId) || map[r.videoId] || (r.kind !== "broad" && r.kind !== "narrow")) continue;
      map[r.videoId] = { kind: r.kind, by: "ai" };
      n++;
    }
    await writeKinds(owner, map);
    return { classified: n };
  },

  /** ④ 고른 Hook 을 대본 포맷의 Hook 목록에 더한다 (다음 원고부터 쓰인다) */
  async saveHooks(input: { formatId?: unknown; hooks?: unknown }): Promise<{ added: number; formatName: string }> {
    const formatId = String(input.formatId ?? "");
    const add = (Array.isArray(input.hooks) ? input.hooks : []).map((h) => String(h).trim()).filter(Boolean).slice(0, 20);
    if (!add.length) throw new AppError("VALIDATION", "저장할 Hook 을 골라 주세요.");
    const f = (await scriptFormatService.list()).find((x) => x.id === formatId);
    if (!f) throw new AppError("NOT_FOUND", "대본 포맷을 찾을 수 없습니다.", 404);
    const before = f.hooks ?? [];
    const next = [...new Set([...before, ...add])];
    await scriptFormatService.update(f.id, { ...f, hooks: next });
    return { added: next.length - before.length, formatName: f.name };
  },
};
