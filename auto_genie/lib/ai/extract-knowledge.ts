import "server-only";
import { chatModel } from "./provider";
import { generateStructured } from "./generate-structured";
import { knowledgeExtractionSchema, type KnowledgeExtraction } from "./schemas";
import { PROMPT_INJECTION_GUARD, wrapReferenceContext } from "./prompt-safety";

const MAX_CHUNKS_FOR_EXTRACTION = 20;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  url: "웹페이지",
  text: "직접 입력 텍스트",
  pdf: "PDF 문서",
  docx: "Word 문서",
  txt: "텍스트 파일",
  markdown: "마크다운 문서",
  performance: "성과 데이터",
};

export interface ChunkForExtraction {
  index: number;
  content: string;
}

export async function extractKnowledgeFromChunks(params: {
  organizationName: string;
  dataSourceTitle: string;
  dataSourceType: string;
  chunks: ChunkForExtraction[];
}): Promise<KnowledgeExtraction> {
  const selected = params.chunks.slice(0, MAX_CHUNKS_FOR_EXTRACTION);
  const chunkBlock = selected.map((c) => `[chunk ${c.index}]\n${c.content}`).join("\n\n---\n\n");

  const system = `당신은 중소기업 마케팅 데이터 분석 AI다. 기업의 원천 자료를 읽고 상품, 고객, 문제, 해결책, 설득 논리, 전문지식, 브랜드 표현, 의사결정 규칙을 구조화된 JSON으로 추출한다.
${PROMPT_INJECTION_GUARD}
추측이나 일반 상식이 아니라 제공된 자료에 실제로 근거한 내용만 추출하고, 각 항목의 confidence는 근거의 명확성에 비례해 0~1 사이로 신중하게 부여한다.
자료에서 확인할 수 없는 내용은 만들어내지 말고 entities/relations/decisionRules 배열에서 제외한다. brandProfile의 각 필드도 근거가 없으면 빈 배열 또는 빈 문자열로 둔다.`;

  const prompt = `기업명: ${params.organizationName}
자료 제목: ${params.dataSourceTitle}
자료 유형: ${SOURCE_TYPE_LABELS[params.dataSourceType] ?? params.dataSourceType}

${wrapReferenceContext(params.dataSourceTitle, chunkBlock)}

위 자료를 분석해 entities, relations, decisionRules, brandProfile을 포함하는 JSON을 생성하라.
entities[].evidenceChunkIndexes에는 근거가 된 [chunk N]의 N 값을 넣어라.`;

  return generateStructured({
    model: chatModel(),
    schema: knowledgeExtractionSchema,
    system,
    prompt,
  });
}
