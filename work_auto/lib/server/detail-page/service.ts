import "server-only";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { NO_RATING_RULE, isRatingTalk } from "@/lib/script-format";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { productPhotoBuffers, videoFrameBuffers } from "../media/photo-sources";
import { fontFamilyOf } from "../video/text-image";
import { videoStorage } from "../video/storage";

/**
 * 상세페이지 만들기 (v0.9.167) — 제품 라이브러리 제품으로 쇼핑몰 상세페이지 이미지(폭 860px) + 상품 등록명·검색 키워드·태그 추천.
 * - 사진: 제품 사진 · 연결된 샤오홍슈 영상 장면 · 직접 올리기 (무료)
 * - [기획·글 만들기] AI 1번: 사진을 보고 섹션 구성(첫 화면·사진+설명·글·제품 정보·마무리) + 등록명 5 + 키워드 20 + 태그 10
 * - [이미지 만들기] 캔버스로 섹션마다 PNG + 이어 붙인 전체 JPG (외부 비용 없음). 제품 사실(분석 결과) 범위 안에서만 쓴다
 * 저장 {owner}/detail/… (DB 변경 없음)
 */
export const DETAIL_W = 860;
const MAX_PHOTOS = 24;
const MAX_SECTIONS = 12;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type SectionKind = "hero" | "photo" | "text" | "spec" | "cta";
export const SECTION_LABEL: Record<SectionKind, string> = { hero: "첫 화면 (Hook)", photo: "사진 + 설명", text: "글 (공감·고민)", spec: "제품 정보 표", cta: "마무리 (구매 유도)" };
export interface DetailSection {
  kind: SectionKind;
  title: string;
  /** 줄바꿈 = 줄. 제품 정보 표는 '항목: 값' 한 줄에 하나 */
  body: string;
  photoKey: string | null;
}
export interface DetailProject {
  id: string;
  name: string;
  productId: string | null;
  photos: string[];
  sections: DetailSection[];
  names: string[];
  keywords: string[];
  tags: string[];
  accent: string;
  rendered: string[];
  full: string | null;
  createdAt: string;
  updatedAt: string;
}

const listKey = (owner: string) => `${owner}/detail/projects.json`;
async function readAll(owner: string): Promise<DetailProject[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as DetailProject[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(owner: string, list: DetailProject[]) {
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(list.slice(0, 40))), "application/json", "0");
}
async function own(owner: string, id: unknown) {
  const list = await readAll(owner);
  const p = list.find((x) => x.id === String(id ?? ""));
  if (!p) throw new AppError("NOT_FOUND", "상세페이지를 찾을 수 없습니다.", 404);
  return { list, p };
}
async function save(owner: string, list: DetailProject[], p: DetailProject) {
  p.updatedAt = nowIso();
  await writeAll(owner, [p, ...list.filter((x) => x.id !== p.id)]);
  return p;
}
async function withUrls(p: DetailProject) {
  const keys = [...p.photos, ...p.rendered, ...(p.full ? [p.full] : [])];
  const urls = keys.length ? await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>) : {};
  return { ...p, urls };
}

/** 사진은 비율 그대로 긴 변 1600px 로 줄여 저장 */
async function addPhoto(owner: string, p: DetailProject, buf: Buffer): Promise<boolean> {
  if (p.photos.length >= MAX_PHOTOS) return false;
  const img = await loadImage(buf).catch(() => null);
  if (!img || img.width < 200 || img.height < 200) return false;
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const key = `${owner}/detail/${p.id}/p${createId("ph").slice(-8)}.jpg`;
  await videoStorage.put(key, c.toBuffer("image/jpeg", 90), "image/jpeg");
  p.photos.push(key);
  return true;
}

const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const KINDS: SectionKind[] = ["hero", "photo", "text", "spec", "cta"];
const cleanSections = (raw: unknown, photos: Set<string>): DetailSection[] =>
  (Array.isArray(raw) ? raw : []).slice(0, MAX_SECTIONS).map((x: Partial<DetailSection>) => ({
    kind: KINDS.includes(x?.kind as SectionKind) ? (x!.kind as SectionKind) : "photo",
    title: str(x?.title, 80).trim(),
    body: str(x?.body, 1200).trim(),
    photoKey: x?.photoKey && photos.has(String(x.photoKey)) ? String(x.photoKey) : null,
  }));

/* ───────── 그리기 ───────── */
function wrap(ctx: SKRSContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n").map((x) => x.trim())) {
    if (!para) {
      out.push("");
      continue;
    }
    let line = "";
    for (const ch of para.split(/(\s+)/)) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxW && line.trim()) {
        out.push(line.trim());
        line = ch.trim();
      } else line = next;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#2F6BFF");

/** 섹션 하나 → PNG (폭 860, 높이는 내용에 맞게) */
export async function drawSection(sec: DetailSection, photo: Buffer | null, accent: string): Promise<Buffer> {
  const W = DETAIL_W;
  const PAD = 56;
  const fam = fontFamilyOf("pretendard");
  const acc = hex(accent);
  const img = photo ? await loadImage(photo).catch(() => null) : null;
  const measure = createCanvas(10, 10).getContext("2d");
  const lines = (size: number, text: string, maxW = W - PAD * 2, weight = "") => {
    measure.font = `${weight} ${size}px ${fam}`.trim();
    return wrap(measure, text, maxW);
  };

  if (sec.kind === "hero") {
    const H = 1075;
    const c = createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const s = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    }
    const tl = lines(66, sec.title, W - PAD * 2, "bold");
    const bl = lines(32, sec.body);
    const blockH = tl.length * 84 + (bl.length ? 24 + bl.length * 46 : 0);
    const g = ctx.createLinearGradient(0, H - blockH - 260, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H - blockH - 260, W, blockH + 260);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = H - blockH - 90;
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 66px ${fam}`;
    for (const l of tl) {
      ctx.fillText(l, W / 2, y);
      y += 84;
    }
    ctx.font = `32px ${fam}`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    y += 24;
    for (const l of bl) {
      ctx.fillText(l, W / 2, y);
      y += 46;
    }
    return c.toBuffer("image/png");
  }

  if (sec.kind === "spec") {
    const rows = sec.body.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.search(/[:：]/);
      return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["", l];
    });
    const rowH = rows.map(([, v]) => Math.max(1, lines(28, v, W - PAD * 2 - 220).length) * 40 + 28);
    const H = PAD + 70 + 30 + rowH.reduce((a, b) => a + b, 0) + PAD;
    const c = createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#F6F7F9";
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = "#111";
    ctx.font = `bold 44px ${fam}`;
    ctx.fillText(sec.title || "제품 정보", W / 2, PAD);
    let y = PAD + 100;
    ctx.textAlign = "left";
    rows.forEach(([k, v], i) => {
      ctx.fillStyle = i % 2 ? "#FFFFFF" : "#EEF1F5";
      ctx.fillRect(PAD, y, W - PAD * 2, rowH[i]);
      ctx.fillStyle = acc;
      ctx.font = `bold 28px ${fam}`;
      ctx.fillText(k, PAD + 24, y + 14, 180);
      ctx.fillStyle = "#222";
      ctx.font = `28px ${fam}`;
      lines(28, v, W - PAD * 2 - 220).forEach((l, j) => ctx.fillText(l, PAD + 220, y + 14 + j * 40));
      y += rowH[i];
    });
    return c.toBuffer("image/png");
  }

  const dark = sec.kind === "cta";
  const tl = lines(dark ? 52 : 46, sec.title, W - PAD * 2, "bold");
  const bl = lines(30, sec.body);
  const photoH = img && sec.kind !== "text" ? Math.min(1100, Math.round((img.height * W) / img.width)) : 0;
  const textH = (sec.title ? tl.length * (dark ? 68 : 62) + 28 : 0) + bl.length * 46;
  const H = PAD + textH + (photoH ? 40 + photoH : 0) + PAD;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = dark ? acc : sec.kind === "text" ? "#F6F7F9" : "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = PAD;
  if (sec.title) {
    ctx.fillStyle = dark ? "#FFFFFF" : "#111";
    ctx.font = `bold ${dark ? 52 : 46}px ${fam}`;
    for (const l of tl) {
      ctx.fillText(l, W / 2, y);
      y += dark ? 68 : 62;
    }
    // 제목 아래 짧은 강조선
    if (!dark) {
      ctx.fillStyle = acc;
      ctx.fillRect(W / 2 - 28, y + 6, 56, 5);
    }
    y += 28;
  }
  ctx.font = `30px ${fam}`;
  ctx.fillStyle = dark ? "rgba(255,255,255,0.92)" : "#444";
  for (const l of bl) {
    ctx.fillText(l, W / 2, y);
    y += 46;
  }
  if (photoH && img) {
    y += 40;
    const s = Math.max(W / img.width, photoH / img.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, W, photoH);
    ctx.clip();
    ctx.drawImage(img, (W - img.width * s) / 2, y + (photoH - img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  }
  return c.toBuffer("image/png");
}

/* ───────── 서비스 ───────── */
export const detailPageService = {
  async list() {
    return readAll(await getCurrentUserId());
  },
  async get(id: unknown) {
    const { p } = await own(await getCurrentUserId(), id);
    return withUrls(p);
  },
  async create(input: { productId?: unknown }) {
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const productId = String(input.productId ?? "");
    const product = await getRepositories().products.get(productId);
    if (!product || product.userId !== owner) throw new AppError("NOT_FOUND", "제품을 골라 주세요.", 404);
    const p: DetailProject = { id: createId("dtl"), name: product.name.slice(0, 60), productId, photos: [], sections: [], names: [], keywords: [], tags: [], accent: "#2F6BFF", rendered: [], full: null, createdAt: nowIso(), updatedAt: nowIso() };
    return withUrls(await save(owner, list, p));
  },
  async remove(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    for (const k of [...p.photos, ...p.rendered, ...(p.full ? [p.full] : [])]) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== p.id));
    return { ok: true };
  },
  async update(input: { id?: unknown; sections?: unknown; names?: unknown; keywords?: unknown; tags?: unknown; accent?: unknown; removePhoto?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (typeof input.removePhoto === "string" && p.photos.includes(input.removePhoto)) {
      p.photos = p.photos.filter((k) => k !== input.removePhoto);
      p.sections = p.sections.map((s) => (s.photoKey === input.removePhoto ? { ...s, photoKey: null } : s));
      await videoStorage.remove(input.removePhoto).catch(() => undefined);
    }
    if (input.sections !== undefined) p.sections = cleanSections(input.sections, new Set(p.photos));
    const arr = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.map((x) => str(x, len).trim()).filter(Boolean).slice(0, n) : null);
    p.names = arr(input.names, 10, 100) ?? p.names;
    p.keywords = arr(input.keywords, 40, 40) ?? p.keywords;
    p.tags = arr(input.tags, 20, 40) ?? p.tags;
    if (typeof input.accent === "string" && /^#[0-9a-f]{6}$/i.test(input.accent)) p.accent = input.accent;
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
  async fromProduct(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    let added = 0;
    for (const buf of await productPhotoBuffers(p.productId!, 16)) if (await addPhoto(owner, p, buf)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },
  async fromVideos(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const frames = await videoFrameBuffers(owner, p.productId!);
    if (!frames) throw new AppError("VALIDATION", "이 제품에 원본을 보관한 샤오홍슈 영상이 없습니다 (제품 상세 › 연결된 영상에서 [다운로드]).");
    let added = 0;
    for (const img of frames) if (await addPhoto(owner, p, img)) added++;
    await save(owner, list, p);
    return { project: await withUrls(p), added };
  },

  /** [기획·글 만들기] AI 1번: 섹션 구성 + 등록명 5 + 키워드 20 + 태그 10 */
  async write(input: { id?: unknown; request?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const repo = getRepositories();
    const product = await repo.products.get(p.productId!);
    if (!product) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
    const analysis = (await repo.productAnalyses.list((a) => a.productId === p.productId, { productId: p.productId! }).catch(() => [])).sort((a, b) => b.version - a.version)[0];
    const sm = analysis?.summary;
    const clean = (xs?: string[]) => (xs ?? []).filter((x) => x && !isRatingTalk(x));
    const facts = [
      `제품명: ${product.name} / 브랜드: ${product.brand} / 카테고리: ${product.category}`,
      sm?.oneLiner ? `한 줄: ${sm.oneLiner}` : "",
      clean(sm?.keyFeatures).length ? `특징: ${clean(sm?.keyFeatures).join(" / ")}` : "",
      clean(sm?.keySpecs).length ? `스펙: ${clean(sm?.keySpecs).join(" / ")}` : "",
      clean(sm?.keyBenefits).length ? `장점: ${clean(sm?.keyBenefits).join(" / ")}` : "",
      clean(sm?.buyingPoints).length ? `구매 포인트: ${clean(sm?.buyingPoints).join(" / ")}` : "",
      clean(sm?.differentiators).length ? `차별점: ${clean(sm?.differentiators).join(" / ")}` : "",
      sm?.useCases?.length ? `사용 상황: ${sm.useCases.join(" / ")}` : "",
      sm?.targetAudience?.length ? `추천 대상: ${sm.targetAudience.join(" / ")}` : "",
      sm?.cautions?.length ? `주의할 점: ${sm.cautions.join(" / ")}` : "",
      analysis?.contentData?.keywords?.length ? `분석 키워드: ${analysis.contentData.keywords.join(", ")}` : "",
    ].filter(Boolean);
    type Out = { names: string[]; keywords: string[]; tags: string[]; sections: { kind: SectionKind; title: string; body: string; photo: number }[] };
    const ai = await getAIProvider();
    let data: Out;
    if (ai.id === "mock") {
      data = {
        names: [`${product.brand} ${product.name}`, `${product.name} 추천 ${product.category}`, `${product.brand} ${product.category} ${product.name}`, `${product.name} 가성비`, `${product.name} 정품`],
        keywords: [product.name, product.category, ...product.tags].slice(0, 20),
        tags: product.tags.slice(0, 10),
        sections: [
          { kind: "hero", title: sm?.oneLiner ?? product.name, body: product.name, photo: 1 },
          { kind: "text", title: "이런 고민 있으셨죠?", body: "자리를 많이 차지해서 불편했던 분\n가볍고 간편한 걸 찾던 분", photo: 0 },
          { kind: "photo", title: "핵심 특징", body: clean(sm?.keyFeatures).slice(0, 3).join("\n"), photo: 2 },
          { kind: "spec", title: "제품 정보", body: clean(sm?.keySpecs).map((x, i) => `항목${i + 1}: ${x}`).join("\n") || "제품명: " + product.name, photo: 0 },
          { kind: "cta", title: "지금 만나보세요", body: product.name, photo: 0 },
        ],
      };
    } else {
      const imgs = await Promise.all(
        p.photos.slice(0, 12).map(async (k) => {
          const b = (await videoStorage.download(k))!;
          const im = await loadImage(b);
          const c = createCanvas(320, Math.round((320 * im.height) / im.width));
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          return c.toBuffer("image/jpeg", 75).toString("base64");
        }),
      );
      const r = await ai.generateStructured<Out>({
        task: "detail-page-write",
        messages: [
          { role: "system", content: "당신은 한국 온라인 쇼핑몰(쿠팡·네이버 스마트스토어) 상세페이지 기획자이자 카피라이터다. 제품 사실만 근거로, 읽기 쉬운 짧은 문장으로 쓴다. 답은 JSON 하나." },
          {
            role: "user",
            content: [
              { type: "text", text: `[제품 사실 — 이 범위 안에서만 쓴다]\n${facts.join("\n")}\n\n아래 사진 ${imgs.length}장 (번호 순):` },
              ...imgs.flatMap((d, i) => [{ type: "text" as const, text: `[사진 ${i + 1}]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: d }]),
              {
                type: "text",
                text: `1) names: 상품 등록명 후보 5개. 쇼핑몰 검색에 걸리게 '브랜드 + 핵심 키워드 + 특징/용도 + 규격(있으면)' 순서, 50자 안쪽, 특수문자·이모지·과장어(최고·1위·특가) 금지, 같은 단어 반복 금지.
2) keywords: 검색 키워드 20개 (사람들이 실제로 검색할 말, 넓은 말 → 좁은 말 섞기, 제품과 관계없는 말 금지).
3) tags: 스마트스토어 태그 10개 (공백 없이, # 없이).
4) sections: 상세페이지 섹션 6~9개, 위에서 아래 순서.
   kind: hero(첫 화면 — 큰 Hook 1~2줄 + 짧은 부제) / text(공감·고민, 사진 없이) / photo(특징 하나씩: 제목 + 설명 2~3줄 + 사진) / spec(제품 정보 표: body 에 '항목: 값' 한 줄에 하나, 스펙 사실만) / cta(마무리 구매 유도).
   권장 흐름: hero → text(이런 고민) → photo(핵심 특징 3~4개, 섹션마다 하나) → photo(사용 장면) → spec → cta.
   photo = 그 섹션에 쓸 사진 번호(1부터, 없으면 0). 사진에 보이는 것과 글이 맞게.
   한 줄 22자 안쪽, 줄바꿈은 \\n. ${NO_RATING_RULE} 사실에 없는 수치·인증·효능은 쓰지 않는다.${input.request ? `\n[사용자 요청 — 가장 먼저 지킨다] ${str(input.request, 300)}` : ""}`,
              },
            ],
          },
        ],
        outputKeys: ["names", "keywords", "tags", "sections"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["names", "keywords", "tags", "sections"],
          properties: {
            names: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
            sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "title", "body", "photo"], properties: { kind: { type: "string", enum: KINDS }, title: { type: "string" }, body: { type: "string" }, photo: { type: "integer" } } } },
          },
        },
        variables: { detail: p.id },
        maxTokens: 3500,
      });
      data = r.data;
    }
    p.names = (data.names ?? []).map((x) => str(x, 100).trim()).filter(Boolean).slice(0, 5);
    p.keywords = [...new Set((data.keywords ?? []).map((x) => str(x, 40).trim()).filter(Boolean))].slice(0, 20);
    p.tags = [...new Set((data.tags ?? []).map((x) => str(x, 40).replace(/[#\s]/g, "")).filter(Boolean))].slice(0, 10);
    p.sections = (data.sections ?? []).slice(0, MAX_SECTIONS).map((x) => ({
      kind: KINDS.includes(x.kind) ? x.kind : "photo",
      title: str(x.title, 80).replace(/\\n/g, "\n").trim(),
      body: str(x.body, 1200).replace(/\\n/g, "\n").trim(),
      photoKey: Number(x.photo) > 0 ? (p.photos[Number(x.photo) - 1] ?? null) : null,
    }));
    return withUrls(await save(owner, list, p));
  },

  /** [이미지 만들기] 섹션마다 PNG + 이어 붙인 전체 JPG (무료) */
  async render(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (!p.sections.length) throw new AppError("VALIDATION", "섹션이 없습니다. [기획·글 만들기]를 먼저 눌러 주세요.");
    for (const k of [...p.rendered, ...(p.full ? [p.full] : [])]) await videoStorage.remove(k).catch(() => undefined);
    const stamp = Date.now().toString(36);
    const pngs: Buffer[] = [];
    const keys: string[] = [];
    for (const [i, sec] of p.sections.entries()) {
      const photo = sec.photoKey ? await videoStorage.download(sec.photoKey).catch(() => null) : null;
      const png = await drawSection(sec, photo, p.accent);
      const key = `${owner}/detail/${p.id}/s${String(i + 1).padStart(2, "0")}_${stamp}.png`;
      await videoStorage.put(key, png, "image/png", "0");
      pngs.push(png);
      keys.push(key);
    }
    // 이어 붙인 전체 1장 (캔버스 높이 한도 안에서)
    const imgs = await Promise.all(pngs.map((b) => loadImage(b)));
    const total = Math.min(30000, imgs.reduce((n, im) => n + im.height, 0));
    const c = createCanvas(DETAIL_W, total);
    const ctx = c.getContext("2d");
    let y = 0;
    for (const im of imgs) {
      if (y >= total) break;
      ctx.drawImage(im, 0, y);
      y += im.height;
    }
    const fullKey = `${owner}/detail/${p.id}/full_${stamp}.jpg`;
    await videoStorage.put(fullKey, c.toBuffer("image/jpeg", 88), "image/jpeg", "0");
    p.rendered = keys;
    p.full = fullKey;
    return withUrls(await save(owner, list, p));
  },
};
