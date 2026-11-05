import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  CAROUSEL_MAX_PHOTOS,
  CAROUSEL_MAX_SLIDES,
  DEFAULT_DESIGN,
  SLIDE_LAYOUTS,
  THEMES,
  newSlideId,
  type CarouselDesign,
  type CarouselImageTask,
  type CarouselSlide,
  type SlideLayout,
  type SlidePos,
  type ThemeId,
} from "@/lib/carousel/types";
import { NO_RATING_RULE, isRatingTalk } from "@/lib/script-format";
import { CAPTION_FONTS } from "@/lib/video-production/config";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider, getVideoAIProvider } from "../providers/registry";
import { VideoAIError } from "../providers/video-ai/kie";
import { getCurrentUserId, getRepositories } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { loadScriptFormats } from "../services/script-formats";
import { productPhotoBuffers, videoFrameBuffers } from "../media/photo-sources";
import { videoStorage } from "../video/storage";
import { drawCarouselSlide } from "./draw";
import { PSYCHOLOGY_CAROUSEL_GUIDE, readAiOptions } from "../settings/ai-options";

/**
 * 인스타그램 캐러셀 (v0.9.173, 예전 '제품 캐러셀' v0.9.163 을 넓힘)
 * - ① 주제·제목·내용 → [글 만들기] AI 1번: 장마다 종류(표지·큰 제목·카드·말풍선·목록·사진 위 글·마무리)·글 + 캡션·해시태그
 * - ② 디자인: 테마·색·글꼴·머리말 / [참고 이미지로 디자인 고르기] AI 1번 (참고 캐러셀을 보고 테마·색)
 * - ③ 그림: 장마다 Kie Nano Banana (1장 = 4크레딧, 확인 후, 자동 재시도 없음) 또는 올리기·제품 사진·영상 장면
 * - ④ [이미지 만들기] 캔버스로 1080×1350 PNG (글자는 직접 그림 — AI 그림의 한글 깨짐 방지). 무료
 * 저장 {owner}/carousel/projects.json (DB 변경 없음). 예전 제품 캐러셀은 읽을 때 '사진 위 글' 장으로 바꿔 연다
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface CarouselProject {
  id: string;
  name: string;
  /** 주제 (예: AI 한테 욕하면 계정 정지) */
  topic: string;
  /** 캐러셀 제목 (비우면 AI 가 정함) */
  title: string;
  /** 넣을 내용·자료 (사실·문장·메모) */
  notes: string;
  productId: string | null;
  contentId: string | null;
  photos: string[];
  slides: CarouselSlide[];
  design: CarouselDesign;
  tasks: CarouselImageTask[];
  caption: string;
  hashtags: string[];
  rendered: string[];
  createdAt: string;
  updatedAt: string;
}

/* ───────── 저장 · 예전 형식 바꾸기 ───────── */
type Legacy = Partial<CarouselProject> & { font?: string; slides?: (Partial<CarouselSlide> & { photoKey?: string; top?: string; text?: string })[] };
const LAYOUTS = new Set(SLIDE_LAYOUTS.map((l) => l.value));
const POS = (v: unknown): SlidePos => (v === "top" || v === "center" ? v : "bottom");

function normalize(raw: Legacy): CarouselProject {
  const legacy = !raw.design;
  const design: CarouselDesign = legacy
    ? { ...DEFAULT_DESIGN, ...THEMES.find((t) => t.value === "photo")!.design, font: raw.font ?? "pretendard", pageNo: false }
    : { ...DEFAULT_DESIGN, ...raw.design };
  const slides = (raw.slides ?? []).map((s) =>
    s.layout
      ? ({ id: s.id || newSlideId(), layout: s.layout, tag: s.tag ?? "", title: s.title ?? "", body: s.body ?? "", lines: s.lines ?? "", imageKey: s.imageKey ?? null, imagePrompt: s.imagePrompt ?? "", pos: POS(s.pos) } as CarouselSlide)
      : ({ id: newSlideId(), layout: "photo", tag: (s as { top?: string }).top ?? "", title: (s as { text?: string }).text ?? "", body: "", lines: "", imageKey: (s as { photoKey?: string }).photoKey ?? null, imagePrompt: "", pos: POS(s.pos) } as CarouselSlide),
  );
  return {
    id: String(raw.id),
    name: raw.name ?? "새 캐러셀",
    topic: raw.topic ?? "",
    title: raw.title ?? "",
    notes: raw.notes ?? "",
    productId: raw.productId ?? null,
    contentId: raw.contentId ?? null,
    photos: raw.photos ?? [],
    slides,
    design,
    tasks: raw.tasks ?? [],
    caption: raw.caption ?? "",
    hashtags: raw.hashtags ?? [],
    rendered: raw.rendered ?? [],
    createdAt: raw.createdAt ?? nowIso(),
    updatedAt: raw.updatedAt ?? nowIso(),
  };
}

const listKey = (owner: string) => `${owner}/carousel/projects.json`;
async function readAll(owner: string): Promise<CarouselProject[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as Legacy[]).map(normalize) : [];
  } catch {
    return [];
  }
}
async function writeAll(owner: string, list: CarouselProject[]) {
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(list.slice(0, 40))), "application/json", "0");
}
async function own(owner: string, id: unknown) {
  const list = await readAll(owner);
  const p = list.find((x) => x.id === String(id ?? ""));
  if (!p) throw new AppError("NOT_FOUND", "캐러셀을 찾을 수 없습니다.", 404);
  return { list, p };
}
async function save(owner: string, list: CarouselProject[], p: CarouselProject) {
  p.updatedAt = nowIso();
  await writeAll(owner, [p, ...list.filter((x) => x.id !== p.id)]);
  return p;
}
async function withUrls(p: CarouselProject) {
  const keys = [...p.photos, ...p.rendered];
  const urls = keys.length ? await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>) : {};
  return { ...p, urls };
}

/** 사진 → 긴 변 1600 JPEG 로 모음에 (비율 그대로, 장 종류마다 그릴 때 잘라 씀) */
async function addPhoto(owner: string, p: CarouselProject, buf: Buffer): Promise<string | null> {
  if (p.photos.length >= CAROUSEL_MAX_PHOTOS) return null;
  const img = await loadImage(buf).catch(() => null);
  if (!img || img.width < 200 || img.height < 200) return null;
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const key = `${owner}/carousel/${p.id}/p${createId("ph").slice(-8)}.jpg`;
  await videoStorage.put(key, c.toBuffer("image/jpeg", 90), "image/jpeg");
  p.photos.push(key);
  return key;
}
async function smallJpeg(buf: Buffer, w = 320): Promise<string> {
  const img = await loadImage(buf);
  const c = createCanvas(w, Math.round((w * img.height) / img.width));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toBuffer("image/jpeg", 78).toString("base64");
}

/* ───────── 고치기 값 정리 ───────── */
const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : d);
function cleanSlide(x: Partial<CarouselSlide>, photos: Set<string>): CarouselSlide {
  return {
    id: typeof x.id === "string" && /^sl_[\w]{4,30}$/.test(x.id) ? x.id : newSlideId(),
    layout: LAYOUTS.has(x.layout as SlideLayout) ? (x.layout as SlideLayout) : "title",
    tag: str(x.tag, 40).trim(),
    title: str(x.title, 200).replace(/\\n/g, "\n").trim(),
    body: str(x.body, 800).replace(/\\n/g, "\n").trim(),
    lines: str(x.lines, 1200).replace(/\\n/g, "\n").trim(),
    imageKey: x.imageKey && photos.has(String(x.imageKey)) ? String(x.imageKey) : null,
    imagePrompt: str(x.imagePrompt, 800).trim(),
    pos: POS(x.pos),
  };
}
function cleanDesign(v: Partial<CarouselDesign>, old: CarouselDesign): CarouselDesign {
  const theme = THEMES.some((t) => t.value === v.theme) ? (v.theme as ThemeId) : old.theme;
  return {
    theme,
    bg: hex(v.bg, old.bg),
    fg: hex(v.fg, old.fg),
    accent: hex(v.accent, old.accent),
    font: typeof v.font === "string" && CAPTION_FONTS.some((f) => f.value === v.font) ? v.font : old.font,
    header: v.header !== undefined ? str(v.header, 60).trim() : old.header,
    badge: v.badge !== undefined ? str(v.badge, 24).trim() : old.badge,
    pageNo: v.pageNo !== undefined ? Boolean(v.pageNo) : old.pageNo,
    note: v.note !== undefined ? str(v.note, 400).trim() : old.note,
  };
}

/* ───────── 서비스 ───────── */
export const carouselService = {
  async list() {
    return readAll(await getCurrentUserId());
  },
  async get(id: unknown) {
    const { p } = await own(await getCurrentUserId(), id);
    return withUrls(p);
  },
  async create(input: { productId?: unknown; contentId?: unknown; topic?: unknown }) {
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const repo = getRepositories();
    const productId = input.productId ? String(input.productId) : null;
    const product = productId ? await repo.products.get(productId) : null;
    if (productId && (!product || product.userId !== owner)) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
    const topic = str(input.topic, 200).trim();
    const p: CarouselProject = {
      id: createId("car"),
      name: (topic || product?.name || "새 캐러셀").slice(0, 60),
      topic,
      title: "",
      notes: "",
      productId,
      contentId: input.contentId ? str(input.contentId, 80) : null,
      photos: [],
      slides: [],
      design: { ...DEFAULT_DESIGN },
      tasks: [],
      caption: "",
      hashtags: [],
      rendered: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return withUrls(await save(owner, list, p));
  },
  async remove(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    for (const k of [...p.photos, ...p.rendered]) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== p.id));
    return { ok: true };
  },
  async update(input: { id?: unknown; name?: unknown; topic?: unknown; title?: unknown; notes?: unknown; slides?: unknown; design?: unknown; caption?: unknown; hashtags?: unknown; contentId?: unknown; productId?: unknown; removePhoto?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (input.name !== undefined) p.name = str(input.name, 60).trim() || p.name;
    if (input.topic !== undefined) p.topic = str(input.topic, 200).trim();
    if (input.title !== undefined) p.title = str(input.title, 120).trim();
    if (input.notes !== undefined) p.notes = str(input.notes, 4000);
    if (typeof input.removePhoto === "string" && p.photos.includes(input.removePhoto)) {
      p.photos = p.photos.filter((k) => k !== input.removePhoto);
      p.slides = p.slides.map((s) => (s.imageKey === input.removePhoto ? { ...s, imageKey: null } : s));
      await videoStorage.remove(input.removePhoto).catch(() => undefined);
    }
    if (Array.isArray(input.slides)) p.slides = (input.slides as Partial<CarouselSlide>[]).slice(0, CAROUSEL_MAX_SLIDES).map((x) => cleanSlide(x, new Set(p.photos)));
    if (input.design && typeof input.design === "object") p.design = cleanDesign(input.design as Partial<CarouselDesign>, p.design);
    if (input.caption !== undefined) p.caption = str(input.caption, 2200);
    if (Array.isArray(input.hashtags)) p.hashtags = input.hashtags.map((h) => str(h, 40).replace(/^#?/, "#")).filter((h) => h.length > 1).slice(0, 30);
    if (input.contentId !== undefined) p.contentId = input.contentId ? str(input.contentId, 80) : null;
    if (input.productId !== undefined) {
      const pid = input.productId ? String(input.productId) : null;
      if (pid) {
        const pr = await getRepositories().products.get(pid);
        if (!pr || pr.userId !== owner) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
      }
      p.productId = pid;
    }
    return withUrls(await save(owner, list, p));
  },
  async upload(input: { id?: unknown; dataUrl?: unknown; slideId?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const m = String(input.dataUrl ?? "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError("VALIDATION", "JPG·PNG·WEBP 사진만 올릴 수 있습니다.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "사진이 너무 큽니다 (10MB 이하).");
    const key = await addPhoto(owner, p, buf);
    if (!key) throw new AppError("VALIDATION", `사진을 읽지 못했거나 ${CAROUSEL_MAX_PHOTOS}장이 넘습니다.`);
    // 장에서 바로 올리면 그 장 그림으로
    if (typeof input.slideId === "string") p.slides = p.slides.map((s) => (s.id === input.slideId ? { ...s, imageKey: key } : s));
    return withUrls(await save(owner, list, p));
  },
  /** 제품 라이브러리 사진 (내 사진 → 쇼핑몰 사진, 무료) */
  async fromProduct(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.productId) throw new AppError("VALIDATION", "참고할 제품을 고른 캐러셀만 제품 사진을 가져올 수 있습니다.");
    let added = 0;
    for (const buf of await productPhotoBuffers(p.productId)) if (await addPhoto(owner, p, buf)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },
  /** 그 제품에 연결된 샤오홍슈 영상(원본 보관)에서 장면 뽑기 (무료) */
  async fromVideos(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.productId) throw new AppError("VALIDATION", "참고할 제품을 고른 캐러셀만 연결된 영상 장면을 뽑을 수 있습니다.");
    const frames = await videoFrameBuffers(owner, p.productId);
    if (!frames) throw new AppError("VALIDATION", "이 제품에 원본을 보관한 샤오홍슈 영상이 없습니다 (제품 상세 › 연결된 영상에서 [다운로드]).");
    let added = 0;
    for (const img of frames) if (await addPhoto(owner, p, img)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },

  /** [참고 이미지로 디자인 고르기] AI 1번: 참고 캐러셀 1~3장을 보고 테마·색·머리말 느낌 */
  async style(input: { id?: unknown; images?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const imgs = (Array.isArray(input.images) ? input.images : [])
      .slice(0, 3)
      .map((u) => String(u).match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/))
      .filter((m): m is RegExpMatchArray => Boolean(m));
    if (!imgs.length) throw new AppError("VALIDATION", "참고할 캐러셀 이미지를 1~3장 올려 주세요.");
    const ai = await getAIProvider();
    type Out = { theme: ThemeId; bg: string; fg: string; accent: string; header: string; badge: string; note: string };
    let out: Out;
    if (ai.id === "mock") out = { theme: "warning", bg: "#0B0B0D", fg: "#F2F2F2", accent: "#E5483D", header: "", badge: "READ FIRST", note: "어두운 바탕, 아주 굵은 흰 제목에 빨간 강조, 테두리 태그" };
    else {
      const small = await Promise.all(imgs.map(async (m) => smallJpeg(Buffer.from(m[2], "base64"), 512)));
      const r = await ai.generateStructured<Out>({
        task: "carousel-style",
        messages: [
          { role: "system", content: "당신은 인스타그램 캐러셀 디자이너다. 참고 이미지의 디자인(바탕색·글자색·강조색·분위기·머리말 형식)을 읽어 JSON 하나로 답한다." },
          {
            role: "user",
            content: [
              ...small.flatMap((d, i) => [{ type: "text" as const, text: `[참고 ${i + 1}]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: d }]),
              {
                type: "text" as const,
                text: `이 느낌으로 만들 테마를 고른다.
- theme: warning(어두운 바탕·경고 느낌) / clean(밝은 정보형) / note(노트·종이 느낌) / photo(사진을 꽉 채우고 글을 얹음) 중 가장 가까운 것
- bg·fg·accent: 바탕색·본문 글자색·강조색 (#RRGGBB)
- header: 위쪽 머리말이 있으면 그 형식을 흉내 낸 예 (없으면 빈 문자열), badge: 오른쪽 위 짧은 표시(예: READ FIRST, 없으면 빈 문자열)
- note: 글꼴 굵기·배치·장식 특징을 한국어 한두 문장으로 (AI 글쓰기에도 참고)`,
              },
            ],
          },
        ],
        outputKeys: ["theme", "bg", "fg", "accent", "header", "badge", "note"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["theme", "bg", "fg", "accent", "header", "badge", "note"],
          properties: { theme: { type: "string", enum: THEMES.map((t) => t.value) }, bg: { type: "string" }, fg: { type: "string" }, accent: { type: "string" }, header: { type: "string" }, badge: { type: "string" }, note: { type: "string" } },
        },
        variables: { carousel: p.id },
        maxTokens: 600,
      });
      out = r.data;
    }
    p.design = cleanDesign({ ...out, header: out.header || p.design.header }, p.design);
    return withUrls(await save(owner, list, p));
  },

  /** [글 만들기] AI 1번: 제목 + 장마다 종류·글·그림 설명 + 캡션·해시태그 */
  async write(input: { id?: unknown; count?: unknown; request?: unknown; psychology?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.topic.trim() && !p.notes.trim() && !p.productId) throw new AppError("VALIDATION", "주제나 넣을 내용을 먼저 써 주세요.");
    const n = Math.min(CAROUSEL_MAX_SLIDES, Math.max(3, Math.round(Number(input.count) || 8)));
    const repo = getRepositories();
    const product = p.productId ? await repo.products.get(p.productId) : null;
    const analysis = p.productId ? (await repo.productAnalyses.list((a) => a.productId === p.productId, { productId: p.productId }).catch(() => [])).sort((a, b) => b.version - a.version)[0] : undefined;
    const content = p.contentId ? await repo.contents.get(p.contentId) : null;
    const script = content && content.userId === owner ? (((content.context.userEdits?.script?.value ?? content.output.script) as string[] | undefined) ?? [])[0] ?? "" : "";
    const sm = analysis?.summary;
    const facts = sm ? [sm.oneLiner, ...(sm.keyBenefits ?? []), ...(sm.buyingPoints ?? []), ...(sm.differentiators ?? [])].filter((x) => x && !isRatingTalk(x)) : [];
    const formats = product ? await loadScriptFormats(owner, "product", "").catch(() => []) : [];
    const hooks = formats.flatMap((f) => f.hooks ?? []).slice(0, 10);
    // v0.9.175 마케팅 심리 원칙: 화면에서 고른 값, 없으면 AI 학습 관리의 공통 설정
    const psychology = typeof input.psychology === "boolean" ? input.psychology : ((await readAiOptions(owner).catch(() => null))?.psychology ?? false);
    const ai = await getAIProvider();
    type Out = { title: string; slides: { layout: SlideLayout; tag: string; title: string; body: string; lines: string; photo: number; imagePrompt: string }[]; caption: string; hashtags: string[] };
    let data: Out;
    if (ai.id === "mock") {
      const t = p.title || p.topic || product?.name || "오늘의 꿀팁";
      data = {
        title: t,
        slides: Array.from({ length: n }, (_, i) =>
          i === 0
            ? { layout: "cover" as const, tag: "WARNING", title: `${t.slice(0, 10)}\n*지금 꼭 보세요*`, body: "모르면 손해입니다…ㄷㄷ\n핵심만 *3개* 정리했습니다.", lines: "", photo: 0, imagePrompt: "a cute fluffy red character pressing a big red button in a dark room, cinematic red light, 3d render" }
            : i === n - 1
              ? { layout: "cta" as const, tag: "", title: "도움 됐다면\n*저장*해 두세요", body: "다음 편도 준비했어요", lines: "버튼: 팔로우하고 다음 편 보기", photo: 0, imagePrompt: "" }
              : i % 3 === 1
                ? { layout: "chat" as const, tag: "", title: `이렇게 하면\n*끝납니다*`, body: "", lines: "막말하면:\n나: 야 또 틀렸네 진짜\n결과: 대화가 종료됐습니다", photo: 0, imagePrompt: "" }
                : i % 3 === 2
                  ? { layout: "cards" as const, tag: "", title: `핵심 *${i}*`, body: "", lines: "이렇게: 짧게 정리한 첫 번째\n저렇게: 두 번째 내용\n결론: 이것만 기억하세요", photo: 0, imagePrompt: "" }
                  : { layout: "list" as const, tag: "", title: "안 걸리는 문장 *4개*", body: "", lines: "첫째: 차분하게 다시 물어보기\n둘째: 조건을 구체적으로\n셋째: 예시 붙이기", photo: 0, imagePrompt: "" },
        ),
        caption: `${t}\n\n저장해 두고 필요할 때 꺼내 보세요.`,
        hashtags: ["#꿀팁", "#정보", "#저장각"],
      };
    } else {
      const imgs = await Promise.all(p.photos.slice(0, 8).map(async (k) => smallJpeg((await videoStorage.download(k))!)));
      const parts = [
        {
          type: "text" as const,
          text: [
            `[주제] ${p.topic || "(없음)"}`,
            p.title ? `[제목 — 이대로 쓴다] ${p.title}` : "",
            p.notes.trim() ? `[넣을 내용·자료 — 사실은 이 범위 안에서만] ${p.notes.trim()}` : "",
            product ? `[참고 제품] ${product.name}${facts.length ? ` / 사실: ${facts.join(" / ")}` : ""}` : "",
            script ? `[영상 원고 대본 — 이 흐름을 나눠 써도 됨] ${script.replace(/\n/g, " / ")}` : "",
            hooks.length ? `[잘된 Hook 예] ${hooks.join(" / ")}` : "",
            p.design.note ? `[디자인 느낌] ${p.design.note}` : "",
            imgs.length ? `아래 사진 ${imgs.length}장 (번호 순, 장에 쓸 수 있음):` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        ...imgs.flatMap((d, i) => [{ type: "text" as const, text: `[사진 ${i + 1}]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: d }]),
        {
          type: "text" as const,
          text: `인스타그램 캐러셀 ${n}장을 만든다 (4:5, 글자는 우리가 직접 그린다).
- title: 캐러셀 제목 (제목을 줬으면 그대로)
- slides ${n}개. layout 은 cover(1장, 꼭) / title / cards / chat / list / photo / cta(마지막 장, 꼭) 중에서 내용에 맞게 섞는다.
  · tag: 작은 태그 (영어 대문자 짧게, 예: WARNING · READ FIRST · TIP 01, 없어도 됨)
  · title: 큰 제목 1~3줄 (줄바꿈 \\n, 한 줄 10자 안쪽). 가장 센 말 하나를 *별표*로 감싸면 강조색 (예: "욕 한 줄에\\n*대화가 끝납니다*")
  · body: cover 는 '첫 줄 = 짧고 센 부제(예: 정지 됩니다…ㄷㄷ)' + 둘째 줄부터 작은 설명 1~2줄, 다른 장은 설명 0~3줄. *강조* 가능
  · lines: cards = '라벨: 내용' 2~4줄 / chat = '구역 이름:'(콜론만) 다음 '나: 말' · '상대: 말' · '결과: 문구' / list = '라벨: 내용' 또는 내용 3~6줄 / cta = '버튼: 문구' 1줄 / 나머지는 빈 문자열
  · photo: 그 장에 쓸 사진 번호 (1부터, 없으면 0)
  · imagePrompt: 그림이 필요한 장(표지는 꼭)만, 영어로 장면 설명 (글자·로고 없이, 예: "a cute fluffy red monster character pressing a glowing red button in a dark room, dramatic red rim light, 3d render, no text"). 필요 없으면 빈 문자열
- 흐름: 1장 = 스크롤을 멈추게 하는 Hook → 중간 = 하나씩 쉽게 → 마지막 = 저장·팔로우·댓글 유도
- 한국어, 짧고 센 문장. 사실이 아닌 수치·날짜·회사 발표를 지어내지 않는다 (내용에 있는 것만). ${NO_RATING_RULE}
- caption: 피드 설명글 4~8줄 (첫 줄은 Hook, 마지막 줄은 행동 유도), hashtags: 8~15개${psychology ? `\n[마케팅 심리 원칙 — 켜져 있음, 사실·정직성 규칙이 우선]\n${PSYCHOLOGY_CAROUSEL_GUIDE.join("\n")}` : ""}${input.request ? `\n[사용자 요청 — 가장 먼저 지킨다] ${str(input.request, 300)}` : ""}`,
        },
      ];
      const r = await ai.generateStructured<Out>({
        task: "carousel-write",
        messages: [
          { role: "system", content: "당신은 저장·공유가 많이 되는 한국 인스타그램 정보형 캐러셀 작가다. 짧고 강한 문장으로 쓴다. 답은 JSON 하나." },
          { role: "user", content: parts },
        ],
        outputKeys: ["title", "slides", "caption", "hashtags"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["title", "slides", "caption", "hashtags"],
          properties: {
            title: { type: "string" },
            slides: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["layout", "tag", "title", "body", "lines", "photo", "imagePrompt"],
                properties: { layout: { type: "string", enum: SLIDE_LAYOUTS.map((l) => l.value) }, tag: { type: "string" }, title: { type: "string" }, body: { type: "string" }, lines: { type: "string" }, photo: { type: "integer" }, imagePrompt: { type: "string" } },
              },
            },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
        },
        variables: { carousel: p.id, n },
        maxTokens: 4000,
      });
      data = r.data;
    }
    const photos = new Set(p.photos);
    if (!p.title) p.title = str(data.title, 120).trim();
    if (p.name === "새 캐러셀" && p.title) p.name = p.title.slice(0, 60);
    p.slides = (data.slides ?? []).slice(0, n).map((x) => cleanSlide({ ...x, imageKey: Number(x.photo) > 0 ? (p.photos[Number(x.photo) - 1] ?? null) : null }, photos));
    p.caption = str(data.caption, 2200);
    p.hashtags = (data.hashtags ?? []).map((h) => str(h, 40).replace(/^#?/, "#")).filter((h) => h.length > 1).slice(0, 30);
    return withUrls(await save(owner, list, p));
  },

  /** [AI 그림] 고른 장마다 Kie 1회 과금 (확인 필수). 표지 그림을 참고로 넣으면 같은 캐릭터로 */
  async image(input: { id?: unknown; slideIds?: unknown; confirmed?: unknown; useCover?: unknown }) {
    if (input.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [만들기]를 눌러 주세요.", 409);
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const prov = await getVideoAIProvider();
    if (!prov) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    const ids = new Set((Array.isArray(input.slideIds) ? input.slideIds : []).map(String));
    const targets = p.slides.filter((s) => ids.has(s.id) && s.imagePrompt.trim() && !p.tasks.some((t) => t.slideId === s.id && t.state === "waiting"));
    if (!targets.length) throw new AppError("VALIDATION", "그림 설명(영어)이 있는 장을 골라 주세요.");
    // 같은 캐릭터: 표지 그림을 참고로 (표지 자신은 제외)
    const coverKey = input.useCover === true ? p.slides.find((s) => s.layout === "cover")?.imageKey : null;
    const refUrl = coverKey ? await prov.uploadImage((await videoStorage.download(coverKey))!).catch(() => null) : null;
    let created = 0;
    for (const s of targets.slice(0, 10)) {
      const t: CarouselImageTask = { id: createId("ct"), slideId: s.id, taskId: null, state: "waiting", error: null, createdAt: nowIso() };
      try {
        const prompt = `${s.imagePrompt}\nVertical 4:5 Instagram carousel illustration. Leave calm empty space at the top for a big headline. Absolutely no text, no letters, no logo, no watermark.`.slice(0, 1800);
        const useRef = refUrl && s.layout !== "cover";
        const r = await prov.createTask(useRef ? "google/nano-banana-edit" : "google/nano-banana", useRef ? { prompt: `${prompt}\nKeep the same character design as the reference image.`, image_urls: [refUrl], output_format: "png", aspect_ratio: "4:5" } : { prompt, output_format: "png", aspect_ratio: "4:5" });
        t.taskId = r.taskId;
        created++;
        console.info("[Carousel] image", JSON.stringify({ carousel: p.id, slide: s.id, taskId: r.taskId }));
      } catch (e) {
        Object.assign(t, { state: "fail", error: e instanceof Error ? e.message.slice(0, 200) : "만들지 못했습니다." });
        p.tasks.push(t);
        if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) break;
        continue;
      }
      p.tasks.push(t);
    }
    p.tasks = p.tasks.slice(-60);
    return { project: await withUrls(await save(owner, list, p)), created };
  },

  /** 그림 상태 확인 (무료): 끝난 것은 받아서 그 장 그림으로 */
  async status(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const busy = p.tasks.filter((t) => t.state === "waiting" && t.taskId);
    if (!busy.length) return withUrls(p);
    const prov = await getVideoAIProvider();
    if (!prov) return withUrls(p);
    for (const t of busy) {
      try {
        const s = await prov.status(t.taskId!);
        if (s.state === "waiting" || s.state === "generating") continue;
        if (s.state === "fail" || !s.resultUrl) {
          Object.assign(t, { state: "fail", error: (s.error ?? "만들지 못했습니다.").slice(0, 200) });
          continue;
        }
        if (new URL(s.resultUrl).protocol !== "https:") throw new Error("결과 주소가 https 가 아닙니다.");
        const res = await safeFetch(s.resultUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`그림을 받지 못했습니다 (HTTP ${res.status}).`);
        const key = await addPhoto(owner, p, Buffer.from(await res.arrayBuffer()));
        if (!key) throw new Error("그림을 저장하지 못했습니다 (사진 모음이 가득 찼을 수 있음).");
        p.slides = p.slides.map((x) => (x.id === t.slideId ? { ...x, imageKey: key } : x));
        t.state = "success";
      } catch (e) {
        if (!(e instanceof VideoAIError)) Object.assign(t, { state: "fail", error: (e instanceof Error ? e.message : "받지 못했습니다.").slice(0, 200) });
      }
    }
    return withUrls(await save(owner, list, p));
  },

  /** [이미지 만들기] 장마다 PNG (무료) */
  async render(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.slides.length) throw new AppError("VALIDATION", "장이 없습니다. [글 만들기]를 먼저 눌러 주세요.");
    const stamp = Date.now().toString(36);
    for (const k of p.rendered) await videoStorage.remove(k).catch(() => undefined);
    const out: string[] = [];
    for (const [i, sl] of p.slides.entries()) {
      const photo = sl.imageKey ? await videoStorage.download(sl.imageKey).catch(() => null) : null;
      const key = `${owner}/carousel/${p.id}/slide_${String(i + 1).padStart(2, "0")}_${stamp}.png`;
      const png = await drawCarouselSlide(sl, p.design, i, p.slides.length, photo).catch((e: unknown) => {
        console.error("[Carousel] slide", JSON.stringify({ id: p.id, i, layout: sl.layout, error: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
        throw new AppError("RENDER", `${i + 1}번 장을 그리지 못했습니다. 그 장 글을 바꿔서 다시 눌러 주세요.`, 500);
      });
      await videoStorage.put(key, png, "image/png", "0");
      out.push(key);
    }
    p.rendered = out;
    return withUrls(await save(owner, list, p));
  },
};
