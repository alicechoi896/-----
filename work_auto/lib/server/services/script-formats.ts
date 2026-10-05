import "server-only";
import { SCRIPT_FORMAT_LIMITS, cleanScriptExamples, exampleKey, formatViews } from "@/lib/script-format";
import { STYLE_LIMITS } from "@/lib/style-limits";
import { cleanPreferredTypes } from "@/lib/style-types";
import type { ChannelId, ScriptFormat, ScriptFormatInput, ScriptFormatType } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError, notFound } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";

/** 대본 포맷을 쓰는 채널 (영상) */
/** 대본 포맷을 쓰는 채널. naver-blog = 블로그 포맷 (v0.9.37: 블로그는 Hook·CTA·제목 패턴과 잘된 제목만 쓴다) */
const FORMAT_CHANNELS: ChannelId[] = ["youtube", "naver-clip", "naver-blog"];

/** Hook·CTA·제목 패턴 목록 정리 (나의 스타일과 같은 한도) */
function phraseList(v: unknown, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = String(x ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}
const TYPES: ScriptFormatType[] = ["product", "info"];

function clean(input: Partial<ScriptFormatInput>): ScriptFormatInput {
  const name = String(input?.name ?? "").trim().slice(0, SCRIPT_FORMAT_LIMITS.nameChars);
  if (!name) throw new AppError("VALIDATION", "포맷 이름을 입력해 주세요.");
  const contentType = TYPES.includes(input.contentType as ScriptFormatType) ? (input.contentType as ScriptFormatType) : null;
  if (!contentType) throw new AppError("VALIDATION", "유형(제품 홍보·정보성)을 골라 주세요.");
  const examples = cleanScriptExamples(input.examples);
  const guideline = String(input.guideline ?? "").replace(/\r\n?/g, "\n").trim().slice(0, SCRIPT_FORMAT_LIMITS.guidelineChars);
  const hooks = phraseList(input.hooks, STYLE_LIMITS.hooks.max);
  const ctas = phraseList(input.ctas, STYLE_LIMITS.ctas.max);
  const titlePatterns = phraseList(input.titlePatterns, STYLE_LIMITS.titlePatterns.max);
  if (!guideline && !examples.length && !hooks.length && !ctas.length && !titlePatterns.length) {
    throw new AppError("VALIDATION", "참고 대본·가이드라인·Hook·CTA·제목 패턴 중 하나는 넣어 주세요.");
  }
  return {
    hooks,
    ctas,
    titlePatterns,
    preferredTypes: cleanPreferredTypes(input.preferredTypes),
    // 피해야 할 대본: 대본이 있는 것만 최대 10개
    badExamples: cleanScriptExamples(input.badExamples).filter((e) => e.text.trim()).slice(0, 10),
    name,
    contentType,
    channelIds: (Array.isArray(input.channelIds) ? input.channelIds : []).filter((c): c is ChannelId => FORMAT_CHANNELS.includes(c)),
    examples,
    guideline,
    isDefault: Boolean(input.isDefault),
  };
}

async function own(id: string): Promise<ScriptFormat> {
  const userId = await getCurrentUserId();
  const row = await getRepositories().scriptFormats.get(id);
  if (!row || row.userId !== userId) notFound("대본 포맷");
  return normalize(row);
}

/** 예전·빈 값 정리 */
function normalize(f: ScriptFormat): ScriptFormat {
  const arr = <T,>(v: T[] | undefined | null) => (Array.isArray(v) ? v : []);
  return {
    ...f,
    channelIds: f.channelIds ?? [],
    examples: arr(f.examples),
    guideline: f.guideline ?? "",
    hooks: arr(f.hooks),
    ctas: arr(f.ctas),
    titlePatterns: arr(f.titlePatterns),
    preferredTypes: f.preferredTypes && typeof f.preferredTypes === "object" ? f.preferredTypes : {},
    badExamples: arr(f.badExamples),
  };
}

/** 같은 유형의 다른 기본 포맷 해제 (유형마다 기본 1개) */
async function clearOtherDefaults(userId: string, keepId: string, contentType: ScriptFormatType) {
  const repo = getRepositories();
  const others = await repo.scriptFormats.list((f) => f.userId === userId && f.id !== keepId && f.isDefault && f.contentType === contentType);
  await Promise.all(others.map((f) => repo.scriptFormats.update(f.id, { isDefault: false, updatedAt: nowIso() })));
}

export const scriptFormatService = {
  async list(): Promise<ScriptFormat[]> {
    const userId = await getCurrentUserId();
    const rows = await getRepositories().scriptFormats.list((f) => f.userId === userId);
    return rows.map(normalize).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: Partial<ScriptFormatInput>): Promise<ScriptFormat> {
    const userId = await getCurrentUserId();
    const data = clean(input);
    const mine = await getRepositories().scriptFormats.list((f) => f.userId === userId && f.contentType === data.contentType);
    const row: ScriptFormat = {
      id: createId("sfm"),
      userId,
      ...data,
      // 이 유형의 첫 포맷은 기본으로
      isDefault: data.isDefault || mine.length === 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await getRepositories().scriptFormats.insert(row);
    if (row.isDefault) await clearOtherDefaults(userId, row.id, row.contentType);
    return row;
  },

  async update(id: string, input: Partial<ScriptFormatInput>): Promise<ScriptFormat> {
    const current = await own(id);
    const data = clean(input);
    const updated = await getRepositories().scriptFormats.update(id, { ...data, updatedAt: nowIso() });
    if (!updated) notFound("대본 포맷");
    if (data.isDefault) await clearOtherDefaults(current.userId, id, data.contentType);
    return normalize(updated);
  },

  async setDefault(id: string): Promise<ScriptFormat> {
    const current = await own(id);
    const updated = await getRepositories().scriptFormats.update(id, { isDefault: true, updatedAt: nowIso() });
    await clearOtherDefaults(current.userId, id, current.contentType);
    return normalize(updated ?? current);
  },

  async remove(id: string): Promise<void> {
    const f = await own(id);
    const repo = getRepositories();
    const linked = await repo.styles.list(
      (s) => s.userId === f.userId && (s.productFormatId === id || s.infoFormatId === id || Boolean(s.productFormatIds?.includes(id)) || Boolean(s.infoFormatIds?.includes(id))),
    );
    await Promise.all(
      linked.map((s) => {
        const p = (s.productFormatIds ?? []).filter((x) => x !== id);
        const i = (s.infoFormatIds ?? []).filter((x) => x !== id);
        return repo.styles.update(s.id, {
          ...(s.productFormatId === id ? { productFormatId: p[0] ?? null } : {}),
          ...(s.infoFormatId === id ? { infoFormatId: i[0] ?? null } : {}),
          ...(s.productFormatIds?.includes(id) ? { productFormatIds: p } : {}),
          ...(s.infoFormatIds?.includes(id) ? { infoFormatIds: i } : {}),
        });
      }),
    );
    await repo.scriptFormats.remove(id);
  },

  /**
   * [대본 포맷에 담기] (트렌드 찾기·영상 검색): 마음에 든 제목을 포맷의 참고 대본 '제목칸에만' 넣는다 (대본은 비움, v0.9.30)
   * - formatId 가 있으면 그 포맷에 더하고, 없으면 newFormat(이름·유형)으로 새로 만든다
   * - 같은 제목은 다시 넣지 않고, 포맷 한도(참고 30개)를 넘는 것은 빼고 알려 준다
   */
  async addTitles(input: {
    formatId?: unknown;
    newFormat?: { name?: unknown; contentType?: unknown } | null;
    titles?: unknown;
  }): Promise<{ format: ScriptFormat; added: number; duplicated: number; overLimit: number }> {
    const incoming = cleanScriptExamples(
      (Array.isArray(input.titles) ? input.titles : []).map((t) => ({ title: (t as { title?: unknown })?.title, views: (t as { views?: unknown })?.views ?? null, text: "" })),
    );
    if (!incoming.length) throw new AppError("VALIDATION", "담을 제목이 없습니다.");
    const formatId = typeof input.formatId === "string" ? input.formatId : "";
    if (!formatId) {
      const name = String(input.newFormat?.name ?? "").trim();
      const kept = incoming.slice(0, SCRIPT_FORMAT_LIMITS.examples);
      const format = await this.create({ name, contentType: input.newFormat?.contentType as ScriptFormatType, channelIds: [], examples: kept, guideline: "", isDefault: false });
      return { format, added: kept.length, duplicated: 0, overLimit: incoming.length - kept.length };
    }
    const current = await own(formatId);
    const seen = new Set(current.examples.map(exampleKey));
    const fresh = incoming.filter((e) => !seen.has(exampleKey(e)));
    const room = Math.max(0, SCRIPT_FORMAT_LIMITS.examples - current.examples.length);
    const kept = fresh.slice(0, room);
    let format = current;
    if (kept.length) {
      // 새로 담은 제목이 목록 위로
      const updated = await getRepositories().scriptFormats.update(formatId, { examples: [...kept, ...current.examples], updatedAt: nowIso() });
      if (!updated) notFound("대본 포맷");
      format = normalize(updated);
    }
    return { format, added: kept.length, duplicated: incoming.length - fresh.length, overLimit: fresh.length - kept.length };
  },

  /**
   * 참고 대본 → 대본 구조 가이드라인 (AI 1회). 저장하지 않고 폼에 채운다 (사용자가 고친 뒤 저장).
   * 스타일 추출(style-extractor)처럼 생성 1회분이 아닌 편집 도구라 Generation Context 를 쓰지 않는다.
   */
  async analyze(input: { examples?: unknown; contentType?: string }): Promise<{ name: string; guideline: string; provider: string }> {
    // 제목만 담은 참고는 구조 분석에 쓰지 않는다 (제목 패턴으로만 쓴다)
    const examples = cleanScriptExamples(input.examples).filter((e) => e.text.trim());
    if (!examples.length) throw new AppError("VALIDATION", "대본 내용이 있는 참고 대본을 1개 이상 넣어 주세요. (제목만 담은 것은 제목 패턴으로만 씁니다)");
    const contentType: ScriptFormatType = input.contentType === "info" ? "info" : "product";
    let budget: number = SCRIPT_FORMAT_LIMITS.analyzeChars;
    const parts: string[] = [];
    for (const [i, e] of [...examples].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).entries()) {
      if (budget <= 0) break;
      const head = `### 대본 ${i + 1}${e.title ? ` · 제목: ${e.title}` : ""}${e.views != null ? ` · 조회수 ${formatViews(e.views)}` : ""}`;
      const text = e.text.slice(0, budget);
      budget -= text.length;
      parts.push(`${head}\n${text}`);
    }
    const template = getPromptTemplate("script.format-extract");
    const ai = await getAIProvider();
    const result = await ai.generateStructured<{ name?: unknown; guideline?: unknown }>({
      task: "script-format-extract",
      messages: [
        { role: "system", content: template.system },
        {
          role: "user",
          content: [template.task, `[유형] ${contentType === "product" ? "제품 홍보 영상 (쇼츠·클립)" : "정보성 영상 (뉴스·꿀팁·이슈 요약)"}`, `[참고 대본 ${parts.length}개]`, ...parts].join("\n"),
        },
      ],
      outputKeys: ["name", "guideline"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name", "guideline"],
        properties: {
          name: { type: "string", description: "포맷 이름 15자 이내" },
          guideline: { type: "string", description: "[구조] [리듬] [Hook 방식] [CTA 방식] [피할 것] 순서의 여러 줄 가이드라인" },
        },
      },
      variables: { examples, contentType },
      maxTokens: 1500,
    });
    const guideline = String(result.data.guideline ?? "").trim().slice(0, SCRIPT_FORMAT_LIMITS.guidelineChars);
    if (!guideline) throw new AppError("AI_BAD_OUTPUT", "포맷을 뽑지 못했습니다. 대본을 조금 더 넣어 다시 시도해 주세요.", 502);
    return {
      name: String(result.data.name ?? "").trim().slice(0, SCRIPT_FORMAT_LIMITS.nameChars) || (contentType === "product" ? "제품 홍보 포맷" : "정보성 포맷"),
      guideline,
      provider: `${result.provider}/${result.model}`,
    };
  },
};

/**
 * 생성용 포맷 목록 (영상·클립 기능만). 테이블이 아직 없거나(schema.sql 재실행 전) 읽기에 실패하면
 * 포맷 없이 생성한다 — 생성 폼에서 포맷을 직접 고른 경우만 오류.
 */
export async function loadScriptFormats(userId: string, type: ScriptFormatType | null, pickedId: string): Promise<ScriptFormat[]> {
  if (!type) return [];
  try {
    return (await getRepositories().scriptFormats.list((f) => f.userId === userId)).map(normalize);
  } catch (e) {
    if (pickedId) throw e;
    return [];
  }
}

/**
 * 여러 포맷 (v0.9.39): ① 생성 요청에 포맷 id 가 있으면 그것 → ② 스타일에 고른 이 유형의 포맷들(최대 3) → ③ 기본 포맷(★)
 * 여러 개면 하나로 합친 '가상 포맷'을 돌려준다 (가이드라인은 번호를 붙여 나열하고, 대본 3편이 하나씩 돌아가며 따르게)
 */
export function chooseScriptFormats(
  rows: ScriptFormat[],
  type: ScriptFormatType | null,
  channelId: ChannelId,
  pickedId: string,
  style: { productFormatIds?: string[]; infoFormatIds?: string[]; productFormatId?: string | null; infoFormatId?: string | null } | null,
): ScriptFormat | null {
  if (!type || pickedId) return chooseScriptFormat(rows, type, channelId, pickedId, style);
  const ids = (type === "product" ? style?.productFormatIds : style?.infoFormatIds) ?? [];
  const linked = ids
    .map((id) => rows.find((f) => f.id === id && f.contentType === type))
    .filter((f): f is ScriptFormat => Boolean(f))
    .slice(0, 3);
  if (linked.length <= 1) return linked[0] ?? chooseScriptFormat(rows, type, channelId, "", style);
  return mergeFormats(linked);
}

export function mergeFormats(list: ScriptFormat[]): ScriptFormat {
  const uniq = (xs: string[]) => [...new Set(xs)];
  const first = list[0];
  return {
    ...first,
    id: list.map((f) => f.id).join("+"),
    name: list.map((f) => f.name).join(" · "),
    guideline: [
      `(대본 포맷 ${list.length}개: 대본 1·2·3 은 아래 포맷을 하나씩 돌아가며 따른다)`,
      ...list.map((f, i) => `[포맷 ${i + 1}: ${f.name}]\n${f.guideline || "(가이드라인 없음 — 이 포맷의 참고 대본 구조를 따른다)"}`),
    ].join("\n\n"),
    examples: list.flatMap((f) => f.examples ?? []),
    badExamples: list.flatMap((f) => f.badExamples ?? []),
    hooks: uniq(list.flatMap((f) => f.hooks ?? [])),
    ctas: uniq(list.flatMap((f) => f.ctas ?? [])),
    titlePatterns: uniq(list.flatMap((f) => f.titlePatterns ?? [])),
    preferredTypes: {
      hooks: uniq(list.flatMap((f) => f.preferredTypes?.hooks ?? [])),
      ctas: uniq(list.flatMap((f) => f.preferredTypes?.ctas ?? [])),
      titlePatterns: uniq(list.flatMap((f) => f.preferredTypes?.titlePatterns ?? [])),
    },
  };
}

/**
 * 생성할 때 쓸 포맷: ① 생성 폼에서 고른 것 → ② 스타일에 연결된 이 유형의 포맷 → ③ 이 유형·채널의 기본 포맷(★)
 * 스타일에 연결된 포맷이 지워졌으면(연결만 남은 예전 데이터) 건너뛴다.
 */
export function chooseScriptFormat(
  rows: ScriptFormat[],
  type: ScriptFormatType | null,
  channelId: ChannelId,
  pickedId: string,
  style: { productFormatId?: string | null; infoFormatId?: string | null } | null,
): ScriptFormat | null {
  if (!type) return null;
  if (pickedId) {
    const picked = rows.find((f) => f.id === pickedId);
    if (!picked) throw new AppError("SCRIPT_FORMAT_NOT_FOUND", "선택한 대본 포맷을 찾을 수 없습니다. 삭제되었을 수 있습니다.", 404);
    return picked;
  }
  const linkedId = type === "product" ? style?.productFormatId : style?.infoFormatId;
  const linked = linkedId ? rows.find((f) => f.id === linkedId && f.contentType === type) : undefined;
  if (linked) return linked;
  const fits = (f: ScriptFormat) => f.contentType === type && f.isDefault && (f.channelIds.length === 0 || f.channelIds.includes(channelId));
  // 이 채널을 직접 고른 포맷(예: 블로그 포맷)을 '모든 채널' 포맷보다 먼저
  return rows.find((f) => fits(f) && f.channelIds.includes(channelId)) ?? rows.find(fits) ?? null;
}

