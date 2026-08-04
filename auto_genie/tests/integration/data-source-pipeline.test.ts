import { describe, expect, it, vi, beforeEach } from "vitest";
import { FakeSupabase } from "./fake-supabase";

vi.mock("@/lib/ai/embed", () => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map((t) => ({ text: t, embedding: Array(1536).fill(0.01) }))),
  currentModelNames: () => ({
    chatModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    embeddingDimension: 1536,
  }),
}));

vi.mock("@/lib/ai/extract-knowledge", () => ({
  extractKnowledgeFromChunks: vi.fn(async () => ({
    entities: [
      {
        type: "customer_problem",
        name: "조회수는 있으나 문의로 이어지지 않음",
        summary: "콘텐츠 조회는 발생하지만 상담 문의 전환이 낮음",
        confidence: 0.85,
        evidenceChunkIndexes: [0],
      },
    ],
    relations: [],
    decisionRules: [
      {
        name: "문의 전환 개선 규칙",
        condition: "조회수는 높지만 문의가 낮음",
        action: "문제 진단형 콘텐츠 비중 확대",
        reason: "대중 관심과 구매 의도는 다를 수 있음",
        category: "conversion",
        weight: 0.7,
        confidence: 0.8,
      },
    ],
    brandProfile: {
      coreMessage: "고객의 문제를 먼저 진단하는 마케팅 파트너",
      tone: ["신뢰감 있는"],
      preferredExpressions: [],
      prohibitedExpressions: [],
      targetAudiences: ["1인 사업자"],
      persuasionStructure: [],
      expertiseAreas: [],
    },
  })),
}));

const { runDataSourcePipeline } = await import("@/lib/pipeline/data-source-pipeline");

describe("runDataSourcePipeline (text source, AI provider mocked)", () => {
  let supabase: FakeSupabase;
  const orgId = "org-1";
  const sourceId = "source-1";

  beforeEach(() => {
    supabase = new FakeSupabase();
    supabase.seed("organizations", { id: orgId, name: "테스트 기업" });
    supabase.seed("data_sources", {
      id: sourceId,
      organization_id: orgId,
      source_type: "text",
      title: "대표 노하우 메모",
      original_text:
        "우리는 온라인 판매자를 위한 콘텐츠 자동화 교육을 제공합니다. 고객들은 조회수는 나오지만 상담 문의로 이어지지 않는다는 문제를 자주 이야기합니다. ".repeat(
          30
        ),
      extracted_text: null,
      storage_path: null,
      status: "pending",
      processing_progress: 0,
      error_message: null,
      metadata: {},
    });
  });

  it("drives the source from pending to completed and persists chunks + knowledge", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runDataSourcePipeline(supabase as any, orgId, sourceId);

    const source = supabase.tables.data_sources.find((s) => s.id === sourceId)!;
    expect(source.status).toBe("completed");
    expect(source.processing_progress).toBe(100);
    expect(source.error_message).toBeNull();

    expect(supabase.tables.document_chunks.length).toBeGreaterThan(0);
    for (const chunk of supabase.tables.document_chunks) {
      expect(chunk.embedding).toBeInstanceOf(Array);
      expect(chunk.data_source_id).toBe(sourceId);
    }

    expect(supabase.tables.knowledge_entities).toHaveLength(1);
    expect(supabase.tables.knowledge_entities[0].name).toBe("조회수는 있으나 문의로 이어지지 않음");

    expect(supabase.tables.decision_rules).toHaveLength(1);
    expect(supabase.tables.decision_rules[0].rule_name).toBe("문의 전환 개선 규칙");

    expect(supabase.tables.brand_profiles).toHaveLength(1);
    expect(supabase.tables.brand_profiles[0].core_message).toContain("문제를 먼저 진단");

    const job = supabase.tables.processing_jobs[0];
    expect(job.status).toBe("completed");
    expect(job.progress).toBe(100);
  });

  it("is safe to re-run (재분석): upserts knowledge instead of duplicating, and replaces chunks", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runDataSourcePipeline(supabase as any, orgId, sourceId);
    const firstChunkCount = supabase.tables.document_chunks.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runDataSourcePipeline(supabase as any, orgId, sourceId);

    expect(supabase.tables.knowledge_entities).toHaveLength(1); // upserted, not duplicated
    expect(supabase.tables.decision_rules).toHaveLength(1);
    expect(supabase.tables.document_chunks.length).toBe(firstChunkCount); // old chunks deleted, replaced
    expect(supabase.tables.processing_jobs).toHaveLength(2); // one job row per run
  });

  it("marks the source as failed and records the error when there is no extractable text", async () => {
    supabase.tables.data_sources[0].original_text = "";
    supabase.tables.data_sources[0].extracted_text = "";

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runDataSourcePipeline(supabase as any, orgId, sourceId)
    ).rejects.toThrow();

    const source = supabase.tables.data_sources.find((s) => s.id === sourceId)!;
    expect(source.status).toBe("failed");
    expect(source.error_message).toBeTruthy();
  });
});
