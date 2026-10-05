import "server-only";
import { SCRIPT_FORMAT_LIMITS, cleanScriptExamples, formatViews } from "@/lib/script-format";
import type { ChannelId, ScriptFormat, ScriptFormatInput, ScriptFormatType } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError, notFound } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";

/** 대본 포맷을 쓰는 채널 (영상) */
const FORMAT_CHANNELS: ChannelId[] = ["youtube", "naver-clip"];
const TYPES: ScriptFormatType[] = ["product", "info"];

function clean(input: Partial<ScriptFormatInput>): ScriptFormatInput {
  const name = String(input?.name ?? "").trim().slice(0, SCRIPT_FORMAT_LIMITS.nameChars);
  if (!name) throw new AppError("VALIDATION", "포맷 이름을 입력해 주세요.");
  const contentType = TYPES.includes(input.contentType as ScriptFormatType) ? (input.contentType as ScriptFormatType) : null;
  if (!contentType) throw new AppError("VALIDATION", "유형(제품 홍보·정보성)을 골라 주세요.");
  const examples = cleanScriptExamples(input.examples);
  const guideline = String(input.guideline ?? "").replace(/\r\n?/g, "\n").trim().slice(0, SCRIPT_FORMAT_LIMITS.guidelineChars);
  if (!guideline && !examples.length) throw new AppError("VALIDATION", "참고 대본을 넣거나 포맷 가이드라인을 적어 주세요.");
  return {
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
  return { ...f, channelIds: f.channelIds ?? [], examples: Array.isArray(f.examples) ? f.examples : [], guideline: f.guideline ?? "" };
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
    const linked = await repo.styles.list((s) => s.userId === f.userId && (s.productFormatId === id || s.infoFormatId === id));
    await Promise.all(
      linked.map((s) =>
        repo.styles.update(s.id, {
          ...(s.productFormatId === id ? { productFormatId: null } : {}),
          ...(s.infoFormatId === id ? { infoFormatId: null } : {}),
        }),
      ),
    );
    await repo.scriptFormats.remove(id);
  },

  /**
   * 참고 대본 → 대본 구조 가이드라인 (AI 1회). 저장하지 않고 폼에 채운다 (사용자가 고친 뒤 저장).
   * 스타일 추출(style-extractor)처럼 생성 1회분이 아닌 편집 도구라 Generation Context 를 쓰지 않는다.
   */
  async analyze(input: { examples?: unknown; contentType?: string }): Promise<{ name: string; guideline: string; provider: string }> {
    const examples = cleanScriptExamples(input.examples);
    if (!examples.length) throw new AppError("VALIDATION", "참고 대본을 1개 이상 넣어 주세요.");
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
  return rows.find(fits) ?? null;
}

