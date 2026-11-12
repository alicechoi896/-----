import "server-only";
import type { GeneratedContent, GeneratedValue } from "@/lib/types";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { contentGenerationService } from "../services/content-generation";
import { carouselService } from "../carousel/service";
import { videoStorage } from "../video/storage";

/**
 * 콘텐츠 세트 (v0.9.199) — 하나(영상 원고·블로그 글·캐러셀)로 시작해 같은 내용으로 나머지(영상 원고·캐러셀·블로그 글·스레드 글)를 만든다.
 * - 처음 만든 것에서 '기준 내용'(주제·제목·Hook·CTA·키워드·핵심 내용)을 뽑고(AI 없이 그대로 읽음), 나머지를 만들 때 함께 넣는다.
 * - 영상 원고·블로그 글은 기존 생성기(대본 포맷·스타일·정직성 규칙 그대로), 캐러셀은 기존 캐러셀(글 만들기), 스레드 글은 여기서 AI 1번.
 * - 누를 때마다 AI 1번 (유료 그림·영상은 각 화면에서 확인 후). 저장: {owner}/sets/sets.json (DB 변경 없음)
 */
export type SetKind = "product" | "info";
export type SetTarget = "script" | "blog" | "carousel" | "threads";

export interface SetCore {
  kind: SetKind;
  title: string;
  topic: string;
  productId: string | null;
  productName: string | null;
  hook: string;
  cta: string;
  keywords: string[];
  /** 기준 내용 (대본·본문·장마다 글) — 다른 것을 만들 때 그대로 근거로 */
  body: string;
  /** v0.9.202 숙소·패션 영상에서 시작한 세트 (영상이 이미 있어 '영상 원고' 대신 그 영상) */
  origin?: "stay" | "fashion" | null;
}
/** 만든 원고·글 (미리 보기 글은 세트에 같이 저장 — 화면이 따로 부르지 않게) */
export interface ItemRef {
  contentId: string;
  featureId: string;
  headline: string;
  preview: string;
}
export interface ContentSet {
  id: string;
  core: SetCore;
  source: { type: "content" | "carousel" | "stay" | "fashion"; id: string; label: string };
  items: {
    script?: ItemRef | null;
    blog?: ItemRef | null;
    carousel?: { id: string; name: string } | null;
    threads?: { posts: string[]; at: string } | null;
    /** v0.9.202 숙소·패션 영상 (그 화면으로 열기) */
    video?: { type: "stay" | "fashion"; id: string; name: string } | null;
  };
  createdAt: string;
  updatedAt: string;
}

const listKey = (owner: string) => `${owner}/sets/sets.json`;
async function readAll(owner: string): Promise<ContentSet[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as ContentSet[]) : [];
  } catch {
    return [];
  }
}
/** 쓰기 직전에 다시 읽어 그 세트만 바꾼다 (다른 요청이 그사이 바꾼 것을 덮지 않게) */
async function save(owner: string, s: ContentSet): Promise<ContentSet> {
  s.updatedAt = nowIso();
  const latest = await readAll(owner);
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify([s, ...latest.filter((x) => x.id !== s.id)].slice(0, 60))), "application/json", "0");
  return s;
}
async function own(owner: string, id: unknown): Promise<ContentSet> {
  const s = (await readAll(owner)).find((x) => x.id === String(id ?? ""));
  if (!s) throw new AppError("NOT_FOUND", "콘텐츠 세트를 찾을 수 없습니다.", 404);
  return s;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const first = (v: GeneratedValue | undefined) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "");
const list = (v: GeneratedValue | undefined) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
const featureKind = (featureId: string): "script" | "blog" | null => (/^(yt|clip)-.*(video|content)$/.test(featureId) ? "script" : featureId.startsWith("blog-") ? "blog" : null);

/** 생성 결과 → 기준 내용 (AI 없이 그대로 읽는다) */
export function coreFromContent(c: GeneratedContent, productName: string | null): SetCore {
  const o = c.output;
  const sel = c.context.workflow?.selected;
  const body = typeof o.body === "string" ? o.body : first(o.script);
  const extra = [...list(o.benefits).map((x) => `장점: ${x}`), ...list(o.info).map((x) => `정보: ${x}`)].join("\n");
  return {
    kind: c.productId ? "product" : "info",
    title: str(sel?.title || c.headline, 120),
    topic: str(String(c.input.topic ?? c.input.mainKeyword ?? "") || c.headline, 120),
    productId: c.productId ?? null,
    productName,
    hook: str(sel?.hook || first(o.hooks), 200),
    cta: str(sel?.cta || first(o.ctas), 200),
    keywords: list(o.keywords).slice(0, 10),
    body: [body, extra].filter(Boolean).join("\n").slice(0, 2500),
  };
}

function coreText(core: SetCore): string {
  return [
    `주제: ${core.topic}`,
    `제목: ${core.title}`,
    core.productName ? `제품: ${core.productName}` : "",
    core.hook ? `Hook: ${core.hook}` : "",
    core.cta ? `CTA: ${core.cta}` : "",
    core.keywords.length ? `키워드: ${core.keywords.join(", ")}` : "",
    `핵심 내용:\n${core.body}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);
}
/** 원고·글 → 세트 항목 (미리 보기: 대본 1편 또는 본문 앞부분) */
function refOf(c: GeneratedContent, headline?: string): ItemRef {
  const body = typeof c.output.body === "string" ? `${first(c.output.titles)}\n\n${c.output.body}` : first(c.output.script);
  return { contentId: c.id, featureId: c.featureId, headline: str(headline || c.context.workflow?.selected?.title || c.headline, 120), preview: body.slice(0, 4000) };
}
const LINK_KEY = "연결된 콘텐츠 (같은 주제·같은 사실로, 형식만 이 채널에 맞게 — 여기에 없는 사실·숫자는 넣지 않는다)";

export const contentSetService = {
  async list(): Promise<ContentSet[]> {
    return readAll(await getCurrentUserId());
  },
  async get(id: unknown): Promise<ContentSet> {
    return own(await getCurrentUserId(), id);
  },
  async remove(id: unknown): Promise<void> {
    const owner = await getCurrentUserId();
    const latest = await readAll(owner);
    await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(latest.filter((x) => x.id !== String(id ?? "")))), "application/json", "0");
  },

  /** 영상 원고·블로그 글에서 시작 */
  async fromContent(contentId: unknown): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const repo = getRepositories();
    const c = await repo.contents.get(String(contentId ?? ""));
    if (!c || c.userId !== owner) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    const kind = featureKind(c.featureId);
    if (!kind) throw new AppError("VALIDATION", "영상 원고·블로그 글에서만 세트를 만들 수 있습니다.");
    const existing = (await readAll(owner)).find((s) => s.source.id === c.id || s.items.script?.contentId === c.id || s.items.blog?.contentId === c.id);
    if (existing) return existing;
    const product = c.productId ? await repo.products.get(c.productId).catch(() => null) : null;
    const core = coreFromContent(c, product?.name ?? null);
    const s: ContentSet = {
      id: createId("set"),
      core,
      source: { type: "content", id: c.id, label: kind === "script" ? "영상 원고" : "블로그 글" },
      items: { [kind]: refOf(c, core.title) },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return save(owner, s);
  },

  /** 캐러셀에서 시작 */
  async fromCarousel(carouselId: unknown): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const car = await carouselService.get(carouselId);
    const existing = (await readAll(owner)).find((s) => s.items.carousel?.id === car.id);
    if (existing) return existing;
    const product = car.productId ? await getRepositories().products.get(car.productId).catch(() => null) : null;
    const slides = (car.slides ?? []).map((x) => [x.title, x.body, x.lines].filter(Boolean).join(" / ").replace(/\*/g, "")).filter(Boolean);
    const core: SetCore = {
      kind: car.productId ? "product" : "info",
      title: str(car.title || car.name, 120),
      topic: str(car.topic || car.name, 120),
      productId: car.productId ?? null,
      productName: product?.name ?? null,
      hook: str(slides[0], 200),
      cta: str(slides[slides.length - 1], 200),
      keywords: (car.hashtags ?? []).map((h) => h.replace(/^#/, "")).slice(0, 10),
      body: [car.notes, ...slides, car.caption].filter(Boolean).join("\n").slice(0, 2500),
    };
    const s: ContentSet = { id: createId("set"), core, source: { type: "carousel", id: car.id, label: "캐러셀" }, items: { carousel: { id: car.id, name: car.name } }, createdAt: nowIso(), updatedAt: nowIso() };
    return save(owner, s);
  },

  /** v0.9.202 AI 숙소 영상에서 시작 — 숙소(제품 라이브러리 '숙소')·제목·컷 대사·사실 메모 */
  async fromStay(stayId: unknown): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const { stayService } = await import("../stay/service");
    const p = await stayService.get(stayId);
    const existing = (await readAll(owner)).find((x) => x.items.video?.type === "stay" && x.items.video.id === p.id);
    if (existing) return existing;
    const product = p.productId ? await getRepositories().products.get(p.productId).catch(() => null) : null;
    const lines = p.photos.map((ph) => ph.line).filter(Boolean);
    const core: SetCore = {
      kind: p.productId ? "product" : "info",
      origin: "stay",
      title: str(`${p.titleSmall} ${p.titleBig}`.trim() || p.name, 120),
      topic: str(p.name, 120),
      productId: p.productId ?? null,
      productName: product?.name ?? p.name,
      hook: str(lines[0], 200),
      cta: str(lines[lines.length - 1], 200),
      keywords: [],
      body: [p.note ? `사실 메모: ${p.note}` : "", lines.length ? `영상 대사: ${lines.join(" / ")}` : "", ...p.photos.map((ph) => ph.motionKo).filter(Boolean).map((x) => `장면: ${x}`)].filter(Boolean).join("\n").slice(0, 2500),
    };
    const s: ContentSet = { id: createId("set"), core, source: { type: "stay", id: p.id, label: "AI 숙소 영상" }, items: { video: { type: "stay", id: p.id, name: p.name } }, createdAt: nowIso(), updatedAt: nowIso() };
    return save(owner, s);
  },

  /** v0.9.202 AI 패션에서 시작 — 주제·POV·룩 문구·상품 이름 (블로그는 정보성 글로: 상품이 여러 개라) */
  async fromFashion(fashionId: unknown): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const { fashionService } = await import("../fashion/service");
    const { project: p } = (await fashionService.get(String(fashionId ?? ""))) as unknown as { project: { id: string; title: string; settings: { theme: string; pov: string; cta: string }; items: { id: string; name: string }[]; looks: { name: string; caption: string; itemIds: string[]; voiceLine?: string }[] } };
    const existing = (await readAll(owner)).find((x) => x.items.video?.type === "fashion" && x.items.video.id === p.id);
    if (existing) return existing;
    const itemName = (id: string) => p.items.find((i) => i.id === id)?.name ?? "";
    const looks = p.looks.map((l) => `${l.name}: ${l.voiceLine || l.caption}${l.itemIds.length ? ` (${l.itemIds.map(itemName).filter(Boolean).join(", ")})` : ""}`);
    const core: SetCore = {
      kind: "info",
      origin: "fashion",
      title: str(p.title, 120),
      topic: str(p.settings.theme || p.title, 120),
      productId: null,
      productName: null,
      hook: str(p.settings.pov.replace(/^\s*POV\s*[:：]\s*/i, ""), 200),
      cta: str(p.settings.cta, 200),
      keywords: [p.settings.theme, ...p.items.map((i) => i.name)].filter(Boolean).slice(0, 10),
      body: [`코디 주제: ${p.settings.theme}`, ...looks].join("\n").slice(0, 2500),
    };
    const s: ContentSet = { id: createId("set"), core, source: { type: "fashion", id: p.id, label: "AI 패션" }, items: { video: { type: "fashion", id: p.id, name: p.title } }, createdAt: nowIso(), updatedAt: nowIso() };
    return save(owner, s);
  },

  /** 기준 내용 고치기 (주제·제목·Hook·CTA·키워드·핵심 내용) */
  async updateCore(id: unknown, patch: Partial<SetCore>): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const s = await own(owner, id);
    s.core = {
      ...s.core,
      ...(patch.title !== undefined ? { title: str(patch.title, 120) } : {}),
      ...(patch.topic !== undefined ? { topic: str(patch.topic, 120) } : {}),
      ...(patch.hook !== undefined ? { hook: str(patch.hook, 200) } : {}),
      ...(patch.cta !== undefined ? { cta: str(patch.cta, 200) } : {}),
      ...(patch.body !== undefined ? { body: str(patch.body, 2500) } : {}),
      ...(Array.isArray(patch.keywords) ? { keywords: patch.keywords.map((k) => str(k, 40)).filter(Boolean).slice(0, 10) } : {}),
    };
    return save(owner, s);
  },

  /** 나머지 만들기 — 누를 때마다 AI 1번 (캐러셀은 글만, 그림은 캐러셀 화면에서 확인 후) */
  async make(id: unknown, target: SetTarget): Promise<ContentSet> {
    const owner = await getCurrentUserId();
    const s = await own(owner, id);
    const core = s.core;
    const link = coreText(core);
    if (target === "script") {
      const featureId = core.productId ? "yt-product-video" : "yt-info-video";
      const category = findGeneratorConfig("yt-info-video")?.fields.find((f) => f.name === "category")?.options?.[0]?.value ?? "생활";
      const input: Record<string, unknown> = core.productId
        ? { productId: core.productId, keywords: core.keywords.slice(0, 5), [LINK_KEY]: link }
        : { category, topic: core.topic, keywords: core.keywords.slice(0, 5), [LINK_KEY]: link };
      const c = await contentGenerationService.generate({ featureId, input } as Parameters<typeof contentGenerationService.generate>[0]);
      s.items.script = refOf(c);
    } else if (target === "blog") {
      const featureId = core.productId ? "blog-product-writing" : "blog-info-writing";
      const input: Record<string, unknown> = core.productId
        ? { productId: core.productId, mainKeyword: core.keywords[0] || core.topic, subKeywords: core.keywords.slice(1, 6), style: ["정보 전달형"], length: "medium", [LINK_KEY]: link }
        : { writingType: "일반 정보", topic: core.topic, mainKeyword: core.keywords[0] || core.topic, length: "medium", [LINK_KEY]: link };
      const c = await contentGenerationService.generate({ featureId, input } as Parameters<typeof contentGenerationService.generate>[0]);
      s.items.blog = refOf(c);
    } else if (target === "carousel") {
      const scriptId = s.items.script?.contentId ?? (s.source.type === "content" ? s.source.id : null);
      let car = s.items.carousel ? await carouselService.get(s.items.carousel.id).catch(() => null) : null;
      if (!car) car = await carouselService.create({ productId: core.productId, contentId: scriptId, topic: core.topic });
      await carouselService.update({ id: car.id, title: core.title, notes: link.slice(0, 2000) });
      const written = await carouselService.write({ id: car.id, count: 8 });
      s.items.carousel = { id: written.id, name: written.name };
    } else if (target === "threads") {
      s.items.threads = { posts: await writeThreads(core), at: nowIso() };
    } else throw new AppError("VALIDATION", "만들 것을 골라 주세요.");
    return save(owner, s);
  },
};

/** 스레드 글: 첫 글 Hook → 핵심 하나씩 → 마지막 CTA (AI 1번) */
async function writeThreads(core: SetCore): Promise<string[]> {
  const ai = await getAIProvider();
  if (ai.id === "mock") return [core.hook || `${core.title}, 이거 모르면 손해예요`, `${core.topic} 핵심 하나`, "핵심 둘", core.cta || "자세한 건 프로필 링크에서 확인해 보세요"];
  const r = await ai.generateStructured<{ posts: string[] }>({
    task: "set-threads",
    messages: [
      { role: "system", content: "당신은 한국어 스레드(Threads) 글 작가다. 짧고 친근한 구어체로, 주어진 기준 내용의 사실만 쓴다. 답은 JSON 하나." },
      {
        role: "user",
        content: `[기준 내용]\n${coreText(core)}\n\n스레드 연재 글 4~6개를 쓴다 (posts 배열, 순서대로 이어 달리는 글).
- 1번: 첫 줄에서 멈추게 하는 Hook (손해·질문·숫자, 기준 Hook 을 살려서), 2문장 안
- 가운데: 핵심 하나씩, 글마다 300자 안, 줄바꿈으로 읽기 쉽게
- 마지막: 행동 유도 (기준 CTA 를 살려서, 예: 프로필 링크·댓글)
- '~니다.'로 끝내지 않는다. 해시태그는 넣지 않는다. 평점·순위·근거 없는 가격·할인은 쓰지 않는다. 기준 내용에 없는 사실·숫자는 만들지 않는다.`,
      },
    ],
    outputKeys: ["posts"],
    jsonSchema: { type: "object", additionalProperties: false, required: ["posts"], properties: { posts: { type: "array", items: { type: "string" } } } },
    variables: { title: core.title },
    maxTokens: 2000,
  });
  return (r.data.posts ?? []).map((p) => String(p).trim().slice(0, 500)).filter(Boolean).slice(0, 8);
}
