import "server-only";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { NO_RATING_RULE, isRatingTalk } from "@/lib/script-format";
import { CAPTION_FONTS } from "@/lib/video-production/config";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { loadScriptFormats } from "../services/script-formats";
import { productPhotoBuffers, videoFrameBuffers } from "../media/photo-sources";
import { fontFamilyOf } from "../video/text-image";
import { videoStorage } from "../video/storage";

/**
 * 제품 캐러셀 (v0.9.163) — 인스타그램 피드용 4:5 사진 여러 장 + 사진 위 글 (레퍼런스: 쌀 크림 피드).
 * - 사진: 제품 라이브러리 사진 · 직접 올리기 · 그 제품에 연결된 샤오홍슈 영상 장면(보관 원본에서 FFmpeg 로 뽑기, 무료)
 * - [글 만들기] AI 1번: 사진을 보고 장마다 위 작은 띠·본문 2~4줄·사진 고르기 + 피드 설명·해시태그. 대본 포맷 Hook·평점 금지 규칙 그대로
 * - [이미지 만들기] 캔버스로 1080×1350 PNG (외부 비용 없음). 프로젝트는 {owner}/carousel/projects.json (DB 변경 없음)
 */
const W = 1080;
const H = 1350;
const MAX_PHOTOS = 20;
const MAX_SLIDES = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type SlidePos = "top" | "center" | "bottom";
export interface Slide {
  photoKey: string;
  /** 위 작은 띠 (선택, 예: '일본 도쿄 돈키호테 품절대란템!!') */
  top: string;
  /** 본문 (줄바꿈 = 줄) */
  text: string;
  pos: SlidePos;
}
export interface CarouselProject {
  id: string;
  name: string;
  productId: string | null;
  contentId: string | null;
  photos: string[];
  slides: Slide[];
  caption: string;
  hashtags: string[];
  font: string;
  rendered: string[];
  createdAt: string;
  updatedAt: string;
}

const listKey = (owner: string) => `${owner}/carousel/projects.json`;
async function readAll(owner: string): Promise<CarouselProject[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as CarouselProject[]) : [];
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

/** 사진 → 4:5 로 꽉 채워 저장 */
async function addPhoto(owner: string, p: CarouselProject, buf: Buffer): Promise<string | null> {
  if (p.photos.length >= MAX_PHOTOS) return null;
  const img = await loadImage(buf).catch(() => null);
  if (!img || img.width < 200 || img.height < 200) return null;
  const c = createCanvas(W, H);
  const s = Math.max(W / img.width, H / img.height);
  c.getContext("2d").drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  const key = `${owner}/carousel/${p.id}/p${createId("ph").slice(-8)}.jpg`;
  await videoStorage.put(key, c.toBuffer("image/jpeg", 90), "image/jpeg");
  p.photos.push(key);
  return key;
}

async function withUrls(p: CarouselProject) {
  const keys = [...p.photos, ...p.rendered];
  const urls = keys.length ? await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>) : {};
  return { ...p, urls };
}

/** 본문 줄 나누기: 넓이를 넘으면 단어 단위로 */
function wrap(ctx: SKRSContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n").map((x) => x.trim()).filter(Boolean)) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** 한 장 그리기 (사진 + 아래·위 그늘 + 흰 굵은 글씨·검은 테두리, 첫 장은 크게) */
export async function drawSlide(photo: Buffer, slide: Slide, first: boolean, fontKey: string): Promise<Buffer> {
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  const img = await loadImage(photo);
  const s = Math.max(W / img.width, H / img.height);
  ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  const fam = fontFamilyOf(CAPTION_FONTS.some((f) => f.value === fontKey) ? fontKey : "pretendard");
  const size = first ? 88 : 66;
  ctx.font = `bold ${size}px ${fam}`;
  const lines = wrap(ctx, slide.text, W * 0.86).slice(0, 6);
  const lh = Math.round(size * 1.3);
  const topH = slide.top ? 64 : 0;
  const blockH = topH + lines.length * lh;
  const y0 = slide.pos === "top" ? 90 : slide.pos === "center" ? Math.round((H - blockH) / 2) : H - blockH - 110;
  // 글자 쪽만 살짝 어둡게 (읽히게)
  const g = ctx.createLinearGradient(0, y0 - 120, 0, y0 + blockH + 120);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, y0 - 120), W, blockH + 240);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (slide.top) {
    ctx.font = `bold 42px ${fam}`;
    const tw = Math.min(W * 0.9, ctx.measureText(slide.top).width + 36);
    ctx.fillStyle = "rgba(20,20,20,0.82)";
    const bx = (W - tw) / 2;
    ctx.beginPath();
    ctx.roundRect(bx, y0, tw, 58, 10);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(slide.top, W / 2, y0 + 8, W * 0.86);
  }
  ctx.font = `bold ${size}px ${fam}`;
  ctx.lineJoin = "round";
  for (const [i, l] of lines.entries()) {
    const y = y0 + topH + i * lh;
    ctx.lineWidth = first ? 12 : 9;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(l, W / 2, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(l, W / 2, y);
  }
  return c.toBuffer("image/png");
}

const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const cleanSlides = (raw: unknown, photos: Set<string>): Slide[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_SLIDES)
    .map((x: Partial<Slide>) => ({ photoKey: String(x?.photoKey ?? ""), top: str(x?.top, 40).trim(), text: str(x?.text, 400).trim(), pos: (x?.pos === "top" || x?.pos === "center" ? x.pos : "bottom") as SlidePos }))
    .filter((x) => photos.has(x.photoKey));

async function smallJpeg(buf: Buffer, w = 320): Promise<string> {
  const img = await loadImage(buf);
  const c = createCanvas(w, Math.round((w * img.height) / img.width));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toBuffer("image/jpeg", 78).toString("base64");
}

export const carouselService = {
  async list() {
    return readAll(await getCurrentUserId());
  },
  async get(id: unknown) {
    const { p } = await own(await getCurrentUserId(), id);
    return withUrls(p);
  },
  async create(input: { productId?: unknown; contentId?: unknown }) {
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const repo = getRepositories();
    const productId = input.productId ? String(input.productId) : null;
    const product = productId ? await repo.products.get(productId) : null;
    if (productId && (!product || product.userId !== owner)) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
    const p: CarouselProject = { id: createId("car"), name: product?.name.slice(0, 60) || "새 캐러셀", productId, contentId: input.contentId ? String(input.contentId).slice(0, 80) : null, photos: [], slides: [], caption: "", hashtags: [], font: "pretendard", rendered: [], createdAt: nowIso(), updatedAt: nowIso() };
    return withUrls(await save(owner, list, p));
  },
  async remove(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    for (const k of [...p.photos, ...p.rendered]) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== p.id));
    return { ok: true };
  },
  async update(input: { id?: unknown; name?: unknown; slides?: unknown; caption?: unknown; hashtags?: unknown; font?: unknown; contentId?: unknown; removePhoto?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (input.name !== undefined) p.name = str(input.name, 60).trim() || p.name;
    if (typeof input.removePhoto === "string" && p.photos.includes(input.removePhoto)) {
      p.photos = p.photos.filter((k) => k !== input.removePhoto);
      p.slides = p.slides.filter((s) => s.photoKey !== input.removePhoto);
      await videoStorage.remove(input.removePhoto).catch(() => undefined);
    }
    if (input.slides !== undefined) p.slides = cleanSlides(input.slides, new Set(p.photos));
    if (input.caption !== undefined) p.caption = str(input.caption, 2200);
    if (Array.isArray(input.hashtags)) p.hashtags = input.hashtags.map((h) => str(h, 40).replace(/^#?/, "#")).filter((h) => h.length > 1).slice(0, 30);
    if (typeof input.font === "string" && CAPTION_FONTS.some((f) => f.value === input.font)) p.font = input.font;
    if (input.contentId !== undefined) p.contentId = input.contentId ? str(input.contentId, 80) : null;
    return withUrls(await save(owner, list, p));
  },
  async upload(input: { id?: unknown; dataUrl?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const m = String(input.dataUrl ?? "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError("VALIDATION", "JPG·PNG·WEBP 사진만 올릴 수 있습니다.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "사진이 너무 큽니다 (10MB 이하).");
    if (!(await addPhoto(owner, p, buf))) throw new AppError("VALIDATION", `사진을 읽지 못했거나 ${MAX_PHOTOS}장이 넘습니다.`);
    return withUrls(await save(owner, list, p));
  },
  /** 제품 라이브러리 사진 (대표·상세 수집 사진, 무료) */
  async fromProduct(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.productId) throw new AppError("VALIDATION", "제품을 고른 캐러셀만 제품 사진을 가져올 수 있습니다.");
    let added = 0;
    for (const buf of await productPhotoBuffers(p.productId)) if (await addPhoto(owner, p, buf)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },
  /** 그 제품에 연결된 샤오홍슈 영상(원본 보관)에서 장면 뽑기 — 영상마다 3장 (25·50·75%), 최대 5개 영상. 무료 */
  async fromVideos(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.productId) throw new AppError("VALIDATION", "제품을 고른 캐러셀만 연결된 영상 장면을 뽑을 수 있습니다.");
    const frames = await videoFrameBuffers(owner, p.productId);
    if (!frames) throw new AppError("VALIDATION", "이 제품에 원본을 보관한 샤오홍슈 영상이 없습니다 (제품 상세 › 연결된 영상에서 [다운로드]).");
    let added = 0;
    for (const img of frames) if (await addPhoto(owner, p, img)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },
  /** [글 만들기] AI 1번: 장마다 사진·위 띠·본문·글자 위치 + 피드 설명·해시태그 */
  async write(input: { id?: unknown; count?: unknown; request?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (p.photos.length < 2) throw new AppError("VALIDATION", "사진을 2장 이상 넣어 주세요.");
    const n = Math.min(MAX_SLIDES, Math.max(3, Math.round(Number(input.count) || 5)));
    const repo = getRepositories();
    const product = p.productId ? await repo.products.get(p.productId) : null;
    const analysis = p.productId ? (await repo.productAnalyses.list((a) => a.productId === p.productId, { productId: p.productId }).catch(() => [])).sort((a, b) => b.version - a.version)[0] : undefined;
    const content = p.contentId ? await repo.contents.get(p.contentId) : null;
    const script = content && content.userId === owner ? (((content.context.userEdits?.script?.value ?? content.output.script) as string[] | undefined) ?? [])[0] ?? "" : "";
    const formats = await loadScriptFormats(owner, "product", "").catch(() => []);
    const hooks = formats.filter((f) => f.contentType === "product").flatMap((f) => f.hooks ?? []).slice(0, 15);
    const sm = analysis?.summary;
    const facts = sm ? [sm.oneLiner, ...(sm.keyBenefits ?? []), ...(sm.buyingPoints ?? []), ...(sm.differentiators ?? [])].filter((x) => x && !isRatingTalk(x)) : [];
    const ai = await getAIProvider();
    type Out = { slides: { photo: number; top: string; text: string; pos: SlidePos }[]; caption: string; hashtags: string[] };
    let data: Out;
    if (ai.id === "mock") {
      data = {
        slides: Array.from({ length: n }, (_, i) => ({ photo: (i % p.photos.length) + 1, top: i === 0 ? "요즘 품절대란템!!" : "", text: i === 0 ? "1개만 사온 걸 후회하는\n모공 삭제템!" : i === n - 1 ? "궁금하면 댓글에\n'아무댓글' 남겨주세요" : `${product?.name ?? "이 제품"}\n써 보니 이게 달라요 ${i}`, pos: i === 0 ? "bottom" : "center" })),
        caption: `${product?.name ?? "이 제품"} 솔직 후기예요.`,
        hashtags: ["#추천템", "#꿀템"],
      };
    } else {
      const imgs = await Promise.all(p.photos.slice(0, 12).map(async (k) => smallJpeg((await videoStorage.download(k))!)));
      const parts = [
        { type: "text" as const, text: `[제품] ${product?.name ?? p.name}${facts.length ? `\n[제품 사실 — 이 범위 안에서만] ${facts.join(" / ")}` : ""}${script ? `\n[영상 원고 대본 — 이 흐름을 캐러셀로 나눈다] ${script.replace(/\n/g, " / ")}` : ""}${hooks.length ? `\n[우리 대본 포맷의 잘된 Hook — 첫 장 문장 구조 참고] ${hooks.join(" / ")}` : ""}\n아래 사진 ${imgs.length}장 (번호 순):` },
        ...imgs.flatMap((d, i) => [{ type: "text" as const, text: `[사진 ${i + 1}]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: d }]),
        {
          type: "text" as const,
          text: `인스타그램 제품 홍보 캐러셀 ${n}장을 만든다 (4:5 사진 위에 글).
- 1장: 스크롤을 멈추게 하는 Hook. top = 위 작은 띠(선택, 18자 이내, 예: "일본 도쿄 돈키호테 품절대란템!!"), text = 큰 글 2~3줄 (예: "1개만 사온 걸 후회하는 모공 삭제템! / 패키지가 귀여워서 집어 왔는데 / 요즘 내 피부 결 미친 거 아님?")
- 2~${n - 1}장: 직접 써 본 사람 말투로 장점·사용 장면을 하나씩, 2~4줄. 사진에 보이는 것과 맞는 내용으로.
- ${n}장: 행동 유도 (예: '댓글에 "아무댓글" 남겨주세요', '저장해 두세요').
- 줄바꿈은 \\n. 한 줄 18자 안쪽. 반말 구어체(친구에게 말하듯) 가능하지만 과장·허위 금지. ${NO_RATING_RULE}
- photo = 그 장에 쓸 사진 번호(1부터, 겹쳐도 됨, 글과 잘 맞는 사진). pos = 글 위치 top/center/bottom (사진의 제품·얼굴을 가리지 않는 쪽).
- caption = 피드 설명글 (3~6줄, 마지막에 행동 유도), hashtags = 해시태그 8~15개.${input.request ? `\n[사용자 요청 — 가장 먼저 지킨다] ${str(input.request, 300)}` : ""}`,
        },
      ];
      const r = await ai.generateStructured<Out>({
        task: "carousel-write",
        messages: [
          { role: "system", content: "당신은 한국 인스타그램 제품 캐러셀 카피라이터다. 사진을 보고 짧고 강한 한국어 문장을 쓴다. 답은 JSON 하나." },
          { role: "user", content: parts },
        ],
        outputKeys: ["slides", "caption", "hashtags"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["slides", "caption", "hashtags"],
          properties: {
            slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["photo", "top", "text", "pos"], properties: { photo: { type: "integer" }, top: { type: "string" }, text: { type: "string" }, pos: { type: "string", enum: ["top", "center", "bottom"] } } } },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
        },
        variables: { carousel: p.id, n },
        maxTokens: 2500,
      });
      data = r.data;
    }
    p.slides = (data.slides ?? []).slice(0, n).map((x, i) => ({ photoKey: p.photos[Math.max(0, Math.min(p.photos.length - 1, Number(x.photo) - 1))] ?? p.photos[i % p.photos.length], top: str(x.top, 40).trim(), text: str(x.text, 400).replace(/\\n/g, "\n").trim(), pos: x.pos === "top" || x.pos === "center" ? x.pos : "bottom" }));
    p.caption = str(data.caption, 2200);
    p.hashtags = (data.hashtags ?? []).map((h) => str(h, 40).replace(/^#?/, "#")).filter((h) => h.length > 1).slice(0, 30);
    return withUrls(await save(owner, list, p));
  },
  /** [이미지 만들기] 장마다 PNG (무료) */
  async render(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.slides.length) throw new AppError("VALIDATION", "장이 없습니다. [글 만들기]를 먼저 눌러 주세요.");
    for (const k of p.rendered) await videoStorage.remove(k).catch(() => undefined);
    const keys: string[] = [];
    for (const [i, sl] of p.slides.entries()) {
      const photo = await videoStorage.download(sl.photoKey);
      if (!photo) continue;
      const key = `${owner}/carousel/${p.id}/slide_${String(i + 1).padStart(2, "0")}_${Date.now().toString(36)}.png`;
      await videoStorage.put(key, await drawSlide(photo, sl, i === 0, p.font), "image/png", "0");
      keys.push(key);
    }
    p.rendered = keys;
    return withUrls(await save(owner, list, p));
  },
};
