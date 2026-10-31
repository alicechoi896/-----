import "server-only";
import { approvedOf, backgroundEn, categoryLabel, DEFAULT_SETTINGS, emptyFashionProject, newFashionId } from "@/lib/fashion/prompts";
import { FASHION_CATEGORIES, type FashionCategory, type FashionImage, type FashionItem, type FashionLook, type FashionProject, type FashionRender, type FashionSection } from "@/lib/fashion/types";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { productService } from "../services/products";
import { videoStorage } from "../video/storage";
import { renderFeed, renderReels, readyLooks } from "./render";
import { fashionDir, isFashionId, loadFashion, ownsFashionKey, readFashionIndex, removeFashionFromIndex, saveFashion, withFashionUrls } from "./store";
import { createFashionImages, createFashionMusic, IMAGE_CREDITS, syncFashion, type FashionImageJob } from "./tasks";

/** AI 패션 피드·릴스 서비스 (v0.9.103). docs/FASHION.md */
const now = () => new Date().toISOString();
const MAX_ITEMS = 40;
const MAX_LOOKS = 10;
const str = (v: unknown, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const CATS = new Set(FASHION_CATEGORIES.map((c) => c.value));
const SECTIONS: FashionSection[] = ["title", "settings", "items", "model", "looks", "bgmKey"];

const UPLOAD_RULES = {
  image: { exts: ["png", "jpg", "jpeg", "webp"], max: 15 * 1024 * 1024, type: (e: string) => (e === "png" ? "image/png" : e === "webp" ? "image/webp" : "image/jpeg") },
  audio: { exts: ["mp3", "m4a", "wav"], max: 20 * 1024 * 1024, type: (e: string) => (e === "wav" ? "audio/wav" : e === "m4a" ? "audio/mp4" : "audio/mpeg") },
} as const;
type UploadKind = keyof typeof UPLOAD_RULES;

async function open(id: string): Promise<{ owner: string; p: FashionProject }> {
  const owner = await getCurrentUserId();
  return { owner, p: await loadFashion(owner, String(id)) };
}

/** 이미지 목록 합치기: 화면은 승인·지우기(removed)만 바꾼다. 서버에만 있는 새 이미지(그 사이 끝난 작업)는 지킨다 */
function mergeImages(server: FashionImage[], client: unknown): FashionImage[] {
  const edits = new Map((Array.isArray(client) ? (client as (Partial<FashionImage> & { removed?: boolean })[]) : []).map((x) => [String(x.id), x]));
  const kept = server.filter((i) => !edits.get(i.id)?.removed).map((i) => (edits.has(i.id) ? { ...i, approved: Boolean(edits.get(i.id)!.approved) } : i));
  // 승인은 1장만 (마지막으로 승인한 것)
  const ok = kept.filter((i) => i.approved);
  if (ok.length > 1) for (const i of ok.slice(0, -1)) i.approved = false;
  return kept;
}

function cleanSection(owner: string, p: FashionProject, section: FashionSection, value: unknown): void {
  const v = (value ?? {}) as Record<string, unknown>;
  switch (section) {
    case "title":
      p.title = str(value, 80) || "새 패션 콘텐츠";
      return;
    case "settings":
      p.settings = {
        theme: str(v.theme, 40) || DEFAULT_SETTINGS.theme,
        background: str(v.background, 30) || DEFAULT_SETTINGS.background,
        backgroundText: str(v.backgroundText, 300),
        pov: str(v.pov, 80),
        cta: str(v.cta, 80),
        secPerLook: Math.min(4, Math.max(1.2, Number(v.secPerLook) || 2)),
        reelStyle: v.reelStyle === "b" ? "b" : "a",
        bgmVolume: Math.min(1, Math.max(0, Number(v.bgmVolume ?? 0.5))),
      };
      return;
    case "items": {
      const list = (Array.isArray(value) ? value : []) as Partial<FashionItem>[];
      const known = new Map(p.items.map((i) => [i.id, i]));
      p.items = list.slice(0, MAX_ITEMS).map((x) => {
        const old = known.get(String(x.id));
        const key = x.imageKey && ownsFashionKey(owner, p.id, String(x.imageKey)) ? String(x.imageKey) : (old?.imageKey ?? null);
        return {
          id: old?.id ?? newFashionId("it"),
          name: str(x.name, 80) || "상품",
          category: CATS.has(x.category as FashionCategory) ? (x.category as FashionCategory) : "top",
          imageKey: key,
          sourceUrl: /^https:\/\//.test(String(x.sourceUrl ?? "")) ? str(x.sourceUrl, 500) : "",
          productId: old?.productId ?? null,
          createdAt: old?.createdAt ?? now(),
        };
      });
      const ids = new Set(p.items.map((i) => i.id));
      for (const l of p.looks) l.itemIds = l.itemIds.filter((id) => ids.has(id));
      return;
    }
    case "model": {
      p.model = {
        mode: v.mode === "photo" ? "photo" : "ai",
        description: str(v.description, 400),
        photoKey: v.photoKey && ownsFashionKey(owner, p.id, String(v.photoKey)) ? String(v.photoKey) : v.photoKey === null ? null : p.model.photoKey,
        images: mergeImages(p.model.images, v.images),
      };
      return;
    }
    case "looks": {
      const list = (Array.isArray(value) ? value : []) as Partial<FashionLook>[];
      const known = new Map(p.looks.map((l) => [l.id, l]));
      const ids = new Set(p.items.map((i) => i.id));
      p.looks = list.slice(0, MAX_LOOKS).map((x, i) => {
        const old = known.get(String(x.id));
        return {
          id: old?.id ?? newFashionId("lk"),
          name: `LOOK ${i + 1}`,
          itemIds: (Array.isArray(x.itemIds) ? x.itemIds.map(String) : []).filter((id) => ids.has(id)).slice(0, 8),
          caption: str(x.caption, 60),
          pose: str(x.pose, 200),
          images: old ? mergeImages(old.images, x.images) : [],
        };
      });
      return;
    }
    case "bgmKey":
      p.bgmKey = value === null ? null : p.tracks.some((t) => t.key === value) ? String(value) : p.bgmKey;
      return;
  }
}

/** 작업 결과를 최신 문서에 합쳐 저장 (그 사이 화면 저장을 덮어쓰지 않게) */
/** 문서 안 이미지·음악 id (작업 전후를 비교해 새로 생긴 것만 합친다 — 그 사이 지운 것을 되살리지 않게) */
const assetIds = (p: FashionProject) => new Set([...p.model.images.map((i) => i.id), ...p.looks.flatMap((l) => l.images.map((i) => i.id)), ...p.tracks.map((t) => t.id)]);

async function saveMerged(owner: string, worked: FashionProject, fresh_ids: Set<string> = new Set()): Promise<FashionProject> {
  const fresh = await loadFashion(owner, worked.id);
  const tasks = new Map(fresh.tasks.map((t) => [t.id, t]));
  for (const t of worked.tasks) tasks.set(t.id, t);
  fresh.tasks = [...tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-300);
  const addNew = (to: FashionImage[], from: FashionImage[]) => {
    const have = new Set(to.map((i) => i.id));
    for (const img of from) if (!have.has(img.id) && fresh_ids.has(img.id)) to.push({ ...img, approved: img.approved && !to.some((x) => x.approved) });
  };
  addNew(fresh.model.images, worked.model.images);
  for (const l of fresh.looks) {
    const w = worked.looks.find((x) => x.id === l.id);
    if (w) addNew(l.images, w.images);
  }
  const haveTr = new Set(fresh.tracks.map((t) => t.id));
  const newTracks = worked.tracks.filter((t) => !haveTr.has(t.id) && fresh_ids.has(t.id));
  fresh.tracks.push(...newTracks);
  if (!fresh.bgmKey && newTracks.length) fresh.bgmKey = newTracks[0].key;
  const rs = new Map(fresh.renders.map((r) => [r.id, r]));
  for (const r of worked.renders) rs.set(r.id, r);
  fresh.renders = [...rs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-20);
  return saveFashion(owner, fresh, now());
}

/* ───── AI 글 (문구·룩 묶기) ───── */
type Json = Record<string, unknown>;
const S = { type: "string" } as const;
const obj = (props: Record<string, Json>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const arr = (items: Json) => ({ type: "array", items });

async function writeCopy(p: FashionProject, regroup: boolean): Promise<{ title: string; pov: string; cta: string; looks: { items: number[]; caption: string; pose: string }[]; aiCalls: number }> {
  const items = p.items.map((it, i) => `${i + 1}. [${categoryLabel(it.category)}] ${it.name}`).join("\n");
  const current = p.looks.map((l) => `${l.name}: ${l.itemIds.map((id) => p.items.findIndex((x) => x.id === id) + 1).join(",")}`).join("\n");
  const schema = obj({ title: S, pov: S, cta: S, looks: arr(obj({ items: arr({ type: "number" }), caption: S, pose: S })) });
  const ai = await getAIProvider();
  if (ai.id === "mock") {
    const groups = regroup || !p.looks.length ? chunk(p.items.map((_, i) => i + 1), 3) : p.looks.map((l) => l.itemIds.map((id) => p.items.findIndex((x) => x.id === id) + 1));
    return { title: `${p.settings.theme} ${groups.length}가지`, pov: `POV: ${p.settings.theme} 고민 끝, 이렇게 입었더니 칭찬 3번 들음`, cta: DEFAULT_SETTINGS.cta, looks: groups.map((g, i) => ({ items: g, caption: `${i + 1}번 룩은 깔끔하게`, pose: "standing naturally, one hand on the bag strap" })), aiCalls: 0 };
  }
  const { data } = await ai.generateStructured<Json>({
    task: "fashion:copy",
    messages: [
      {
        role: "system",
        content: `당신은 한국 인스타그램 패션 릴스·피드 기획자다. 레퍼런스 공식: 같은 모델·같은 배경에서 옷만 바뀌는 LOOK1~6, 위쪽에 끝까지 고정되는 공감 한 줄('POV: 퇴근한 순간부터 연휴 즐기려고 꾸꾸꾸 상태로 출근한 나' 같은), 룩마다 짧은 한 줄. 한국어로 쓴다. 답은 JSON 객체 하나로만 (설명·마크다운 없이). 형식: {"title":"…","pov":"…","cta":"…","looks":[{"items":[1,2],"caption":"…","pose":"…"}]}`,
      },
      {
        role: "user",
        content: `[주제] ${p.settings.theme}\n[배경] ${backgroundEn(p.settings)}\n[상품 목록]\n${items || "(없음)"}\n${!regroup && p.looks.length ? `[지금 룩 묶음 — 그대로 두고 문구만]\n${current}\n` : ""}\n만들 것:\n- title: 프로젝트 제목 (20자 안)\n- pov: 위쪽 고정 공감 문구, 'POV:' 로 시작, 35자 안, 상황·감정이 보이게\n- cta: 마지막 댓글 안내 (예: 댓글에 '링크' 남기면 DM 으로 보내드려요), 35자 안\n- looks: ${!regroup && p.looks.length ? `지금 룩 ${p.looks.length}개 순서 그대로 (items 는 지금 번호 그대로)` : "상품 번호로 룩 3~6개 묶기 (한 룩 = 상의/원피스 + 하의 + 신발·가방 등 함께 입을 것, 같은 상품을 여러 룩에 써도 됨)"}, caption = 룩 한 줄 (15자 안, 예: '하객룩은 차분하게'), pose = 영어 자세 한 문장 (룩마다 조금씩 다르게, 전신이 보이게)`,
      },
    ],
    outputKeys: ["title", "pov", "cta", "looks"],
    jsonSchema: schema,
    variables: {},
    maxTokens: 3000,
  }).catch((e: Error) => {
    throw new AppError("AI_ERROR", `AI 가 문구를 만들지 못했습니다 (${e.message.slice(0, 120)}). 다시 눌러 주세요.`, 502);
  });
  const looks = (Array.isArray(data.looks) ? (data.looks as Json[]) : []).slice(0, MAX_LOOKS).map((l) => ({
    items: (Array.isArray(l.items) ? l.items : []).map(Number).filter((n) => n >= 1 && n <= p.items.length),
    caption: str(l.caption, 40),
    pose: str(l.pose, 200),
  }));
  return { title: str(data.title, 40), pov: str(data.pov, 60), cta: str(data.cta, 60), looks, aiCalls: 1 };
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const fashionService = {
  meta() {
    return { imageCredits: IMAGE_CREDITS };
  },

  async list() {
    const owner = await getCurrentUserId();
    return { projects: await readFashionIndex(owner) };
  },

  async create(body: { title?: unknown; theme?: unknown }) {
    const owner = await getCurrentUserId();
    const p = emptyFashionProject(newFashionId("fp").toLowerCase().replace(/[^a-z0-9_]/g, ""), str(body.title, 80), now());
    if (body.theme) p.settings.theme = str(body.theme, 40);
    await saveFashion(owner, p, now());
    return withFashionUrls(p);
  },

  async get(id: string) {
    const { p } = await open(id);
    return withFashionUrls(p);
  },

  async remove(id: string) {
    const owner = await getCurrentUserId();
    if (!isFashionId(id)) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다.", 404);
    await removeFashionFromIndex(owner, id);
    return { ok: true };
  },

  async patch(id: string, body: { section?: unknown; value?: unknown }) {
    const section = String(body.section) as FashionSection;
    if (!SECTIONS.includes(section)) throw new AppError("VALIDATION", "저장할 수 없는 항목입니다.");
    if (JSON.stringify(body.value ?? null).length > 400_000) throw new AppError("VALIDATION", "내용이 너무 큽니다.");
    const { owner, p } = await open(id);
    cleanSection(owner, p, section, body.value);
    // 최신 문서에 이 부분만 (그 사이 끝난 작업 결과를 덮어쓰지 않게 — 이미지 목록은 mergeImages 로 합침)
    const fresh = await loadFashion(owner, p.id);
    if (section === "model") fresh.model = { ...p.model, images: mergeImages(fresh.model.images, (body.value as { images?: unknown })?.images) };
    else if (section === "looks") {
      const byId = new Map(fresh.looks.map((l) => [l.id, l]));
      fresh.looks = p.looks.map((l) => {
        const f = byId.get(l.id);
        const sent = ((body.value as Partial<FashionLook>[]) ?? []).find((x) => x.id === l.id);
        return f ? { ...l, images: mergeImages(f.images, sent?.images) } : l;
      });
    } else (fresh as unknown as Record<string, unknown>)[section] = (p as unknown as Record<string, unknown>)[section];
    if (section === "items") for (const l of fresh.looks) l.itemIds = l.itemIds.filter((x) => fresh.items.some((i) => i.id === x));
    return withFashionUrls(await saveFashion(owner, fresh, now()));
  },

  /** 무료 동작 + AI 글 */
  async action(id: string, body: { action?: unknown; [k: string]: unknown }) {
    const { owner, p } = await open(id);
    const a = String(body.action);
    let aiCalls = 0;
    switch (a) {
      // AI: 제목·POV·댓글 안내·룩 묶기(regroup) 또는 문구만
      case "copy": {
        if (!p.items.length) throw new AppError("VALIDATION", "① 상품을 먼저 넣어 주세요.");
        const regroup = body.regroup === true || !p.looks.length;
        const r = await writeCopy(p, regroup);
        aiCalls = r.aiCalls;
        if (r.title && (p.title === "새 패션 콘텐츠" || !p.title)) p.title = r.title;
        if (r.pov) p.settings.pov = r.pov;
        if (r.cta) p.settings.cta = r.cta;
        if (regroup) {
          const old = p.looks;
          p.looks = r.looks
            .filter((l) => l.items.length)
            .map((l, i) => ({ id: old[i]?.id ?? newFashionId("lk"), name: `LOOK ${i + 1}`, itemIds: [...new Set(l.items.map((n) => p.items[n - 1].id))], caption: l.caption, pose: l.pose, images: old[i]?.images ?? [] }));
        } else p.looks = p.looks.map((l, i) => ({ ...l, caption: r.looks[i]?.caption || l.caption, pose: r.looks[i]?.pose || l.pose }));
        break;
      }
      // 제품 라이브러리(이미 학습한 쿠팡 상품) → 상품 (대표 이미지를 받아 둔다, 쿠팡 호출 없음)
      case "import-product": {
        const d = await productService.getDetail(String(body.productId ?? ""));
        let imageKey: string | null = null;
        if (d.product.imageUrl && /^https:\/\//.test(d.product.imageUrl)) {
          try {
            const res = await safeFetch(d.product.imageUrl, { signal: AbortSignal.timeout(20_000) });
            const buf = Buffer.from(await res.arrayBuffer());
            if (res.ok && buf.length < 15 * 1024 * 1024) {
              const isPng = buf.subarray(1, 4).toString() === "PNG";
              imageKey = `${fashionDir(owner, p.id)}/up/${newFashionId("pi")}.${isPng ? "png" : "jpg"}`;
              await videoStorage.put(imageKey, buf, isPng ? "image/png" : "image/jpeg");
            }
          } catch {
            imageKey = null;
          }
        }
        const cat = CATS.has(body.category as FashionCategory) ? (body.category as FashionCategory) : "top";
        p.items.push({ id: newFashionId("it"), name: d.product.name.slice(0, 80), category: cat, imageKey, sourceUrl: d.product.sourceUrl ?? "", productId: d.product.id, createdAt: now() });
        break;
      }
      case "delete-render": {
        const ids = body.all === true ? p.renders.map((r) => r.id) : [String(body.renderId ?? "")];
        const gone = p.renders.filter((r) => ids.includes(r.id) && r.status !== "running");
        if (!gone.length) throw new AppError("VALIDATION", "지울 결과물이 없습니다 (만드는 중인 것은 지울 수 없습니다).");
        p.renders = p.renders.filter((r) => !gone.includes(r));
        for (const k of gone.flatMap((r) => r.keys)) await videoStorage.remove(k).catch(() => undefined);
        break;
      }
      case "delete-track": {
        const t = p.tracks.find((x) => x.id === body.trackId);
        if (!t) throw new AppError("NOT_FOUND", "음악을 찾지 못했습니다.", 404);
        p.tracks = p.tracks.filter((x) => x.id !== t.id);
        if (p.bgmKey === t.key) p.bgmKey = null;
        await videoStorage.remove(t.key).catch(() => undefined);
        break;
      }
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
    console.info("[Fashion] action", JSON.stringify({ project: p.id, action: a, aiCalls, clientRequestId: String(body.clientRequestId ?? "-").slice(0, 40) }));
    return { ...(await withFashionUrls(await saveFashion(owner, p, now()))), aiCalls };
  },

  /** 이미지 만들기 (Kie, 1장 = 1회 과금, 확인 후에만) */
  async images(id: string, body: { jobs?: unknown; clientRequestId?: unknown; confirmed?: unknown }) {
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [만들기]를 눌러 주세요.", 409);
    const requestId = str(body.clientRequestId, 80);
    if (requestId.length < 8) throw new AppError("VALIDATION", "요청 번호가 없습니다.");
    const { owner, p } = await open(id);
    const jobs = (Array.isArray(body.jobs) ? body.jobs : []) as FashionImageJob[];
    const tasks = await createFashionImages(p, jobs, requestId);
    p.tasks = [...p.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks];
    const saved = await saveMerged(owner, p);
    return { ...(await withFashionUrls(saved)), created: tasks.filter((t) => t.externalTaskId).length, failed: tasks.filter((t) => t.status === "fail").length };
  },

  /** 음악 만들기 (Kie Suno, 1회 과금, 확인 후에만) */
  async music(id: string, body: { note?: unknown; clientRequestId?: unknown; confirmed?: unknown }) {
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [만들기]를 눌러 주세요.", 409);
    const requestId = str(body.clientRequestId, 80);
    if (requestId.length < 8) throw new AppError("VALIDATION", "요청 번호가 없습니다.");
    const { owner, p } = await open(id);
    if (p.tasks.some((t) => t.kind === "music" && (t.status === "generating" || t.status === "requesting") && t.requestId !== requestId)) throw new AppError("BUSY", "음악을 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const tasks = await createFashionMusic(p, str(body.note, 300), requestId);
    p.tasks = [...p.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks];
    return withFashionUrls(await saveMerged(owner, p));
  },

  async sync(id: string) {
    const { owner, p } = await open(id);
    const before = assetIds(p);
    const changed = await syncFashion(owner, p);
    const added = new Set([...assetIds(p)].filter((x) => !before.has(x)));
    return { ...(await withFashionUrls(changed ? await saveMerged(owner, p, added) : p)), changed };
  },

  async uploadUrl(id: string, body: { kind?: unknown; fileName?: unknown; size?: unknown }) {
    const kind = String(body.kind) as UploadKind;
    const rule = UPLOAD_RULES[kind];
    if (!rule) throw new AppError("VALIDATION", "올릴 수 없는 파일 종류입니다.");
    const ext = String(body.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (!(rule.exts as readonly string[]).includes(ext)) throw new AppError("VALIDATION", `${rule.exts.join("·")} 파일만 올릴 수 있습니다.`);
    if (Number(body.size) > rule.max) throw new AppError("VALIDATION", `파일이 너무 큽니다 (최대 ${Math.round(rule.max / 1048576)}MB).`);
    const owner = await getCurrentUserId();
    if (!isFashionId(String(id))) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다.", 404);
    const key = `${fashionDir(owner, String(id))}/up/${newFashionId(kind[0])}.${ext === "jpeg" ? "jpg" : ext}`;
    const up = await videoStorage.signedUpload(key, "/api/fashion/upload");
    return { key, ...up, contentType: rule.type(ext) };
  },

  /** 올린 파일 잇기: item(새 상품 또는 itemId 사진 바꾸기) · model-photo · look(룩 이미지 직접) · bgm */
  async register(id: string, body: { key?: unknown; fileName?: unknown; target?: unknown }) {
    const { owner, p } = await open(id);
    const key = String(body.key ?? "");
    if (!ownsFashionKey(owner, p.id, key)) throw new AppError("VALIDATION", "이 프로젝트에 올린 파일이 아닙니다.");
    if (!(await videoStorage.download(key))) throw new AppError("NOT_FOUND", "올린 파일을 찾지 못했습니다. 다시 올려 주세요.", 404);
    const fileName = str(body.fileName, 120);
    const t = (body.target ?? {}) as { type?: string; itemId?: string; lookId?: string; category?: string; sourceUrl?: string };
    if (t.type === "item") {
      const it = p.items.find((x) => x.id === t.itemId);
      if (it) it.imageKey = key;
      else
        p.items.push({
          id: newFashionId("it"),
          name: fileName.replace(/\.[^.]+$/, "").slice(0, 80) || "상품",
          category: CATS.has(t.category as FashionCategory) ? (t.category as FashionCategory) : "top",
          imageKey: key,
          sourceUrl: /^https:\/\//.test(String(t.sourceUrl ?? "")) ? str(t.sourceUrl, 500) : "",
          productId: null,
          createdAt: now(),
        });
    } else if (t.type === "model-photo") {
      p.model = { ...p.model, mode: "photo", photoKey: key };
    } else if (t.type === "model") {
      for (const i of p.model.images) i.approved = false;
      p.model.images.push({ id: newFashionId("im"), key, prompt: "", modelId: "upload", source: "upload", createdAt: now(), approved: true });
    } else if (t.type === "look") {
      const look = p.looks.find((l) => l.id === t.lookId);
      if (!look) throw new AppError("VALIDATION", "룩을 찾지 못했습니다.");
      for (const i of look.images) i.approved = false;
      look.images.push({ id: newFashionId("im"), key, prompt: "", modelId: "upload", source: "upload", createdAt: now(), approved: true });
    } else if (t.type === "bgm") {
      p.tracks.push({ id: newFashionId("tr"), key, name: fileName.slice(0, 60) || "올린 음악", source: "upload", createdAt: now() });
      p.bgmKey = key;
    } else throw new AppError("VALIDATION", "어디에 쓸 파일인지 알 수 없습니다.");
    return withFashionUrls(await saveFashion(owner, p, now()));
  },

  /** 데모(Supabase 없음)에서만 */
  async uploadMemory(key: string, body: ArrayBuffer) {
    const owner = await getCurrentUserId();
    if (!key.startsWith(`${owner}/fashion/`) || key.includes("..")) throw new AppError("VALIDATION", "잘못된 주소입니다.");
    await videoStorage.put(key, Buffer.from(body));
  },

  /** 결과물 만들기 시작 (응답 뒤 같은 함수 안에서) — 외부 유료 호출 없음 */
  async startRender(id: string, body: { kind?: unknown }): Promise<{ result: Awaited<ReturnType<typeof withFashionUrls>>; run: () => Promise<void> }> {
    const { owner, p } = await open(id);
    const kind = body.kind === "reels" ? "reels" : "feed";
    if (!readyLooks(p).length) throw new AppError("VALIDATION", "④ 룩 이미지를 1개 이상 승인해 주세요.");
    if (kind === "reels" && p.settings.reelStyle === "b") throw new AppError("VALIDATION", "릴스 (나) AI 영상은 다음 업데이트에서 열립니다. 지금은 (가) 사진 + 움직임으로 만들어 주세요.");
    if (p.renders.some((r) => r.status === "running" && Date.now() - Date.parse(r.updatedAt) < 15 * 60_000)) throw new AppError("BUSY", "결과물을 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const at = now();
    const r: FashionRender = { id: newFashionId("fr"), kind, status: "running", keys: [], totalSec: null, error: null, createdAt: at, updatedAt: at };
    p.renders.push(r);
    const saved = await saveFashion(owner, p, at);
    const run = async () => {
      const t0 = Date.now();
      try {
        if (kind === "feed") r.keys = await renderFeed(owner, p, r);
        else {
          const out = await renderReels(owner, p, r);
          r.keys = [out.key];
          r.totalSec = out.totalSec;
        }
        r.status = "success";
      } catch (e) {
        r.status = "fail";
        r.error = (e instanceof Error ? e.message : "만들지 못했습니다.").slice(0, 200);
        console.error("[FashionRender] fail", JSON.stringify({ project: p.id, render: r.id, error: r.error }));
      }
      r.updatedAt = now();
      console.info("[FashionRender]", JSON.stringify({ project: p.id, render: r.id, kind, status: r.status, ms: Date.now() - t0 }));
      await saveMerged(owner, { ...p, tasks: [], renders: [r] }).catch(() => undefined);
    };
    return { result: await withFashionUrls(saved), run };
  },
};

export { approvedOf };
