import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { fetchAndExtractUrl, UrlAnalysisError } from "@/lib/ingestion/url-fetch";
import { extractFileText, FileExtractionError } from "@/lib/ingestion/file-extract";
import { chunkText } from "@/lib/ingestion/chunk";
import { embedTexts, currentModelNames } from "@/lib/ai/embed";
import { extractKnowledgeFromChunks } from "@/lib/ai/extract-knowledge";
import type { KnowledgeExtraction } from "@/lib/ai/schemas";

type Client = SupabaseClient<Database>;

export class PipelineError extends Error {}

async function updateJob(
  supabase: Client,
  jobId: string,
  patch: Partial<Database["public"]["Tables"]["processing_jobs"]["Update"]>
) {
  await supabase.from("processing_jobs").update(patch).eq("id", jobId);
}

async function updateSource(
  supabase: Client,
  sourceId: string,
  patch: Partial<Database["public"]["Tables"]["data_sources"]["Update"]>
) {
  await supabase.from("data_sources").update(patch).eq("id", sourceId);
}

/** Downloads a file previously uploaded to Storage during registration. */
async function downloadStoredFile(supabase: Client, storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from("data-source-files").download(storagePath);
  if (error || !data) {
    throw new PipelineError("업로드된 파일을 불러올 수 없습니다: " + (error?.message ?? "not found"));
  }
  return Buffer.from(await data.arrayBuffer());
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function mergeStringArrays(a: Json, b: string[]): string[] {
  const existing = Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  return Array.from(new Set([...existing, ...b.filter(Boolean)])).slice(0, 50);
}

async function persistKnowledge(
  supabase: Client,
  organizationId: string,
  dataSourceId: string,
  chunkRows: { id: string; chunk_index: number }[],
  extraction: KnowledgeExtraction
) {
  const chunkByIndex = new Map(chunkRows.map((c) => [c.chunk_index, c.id]));

  // entities ---------------------------------------------------------------
  const entityNameToId = new Map<string, string>();
  for (const entity of extraction.entities) {
    const { data, error } = await supabase
      .from("knowledge_entities")
      .upsert(
        {
          organization_id: organizationId,
          entity_type: entity.type,
          name: entity.name,
          summary: entity.summary,
          confidence_score: entity.confidence,
        },
        { onConflict: "organization_id,entity_type,name" }
      )
      .select("id")
      .single();

    if (error || !data) continue;
    entityNameToId.set(entity.name, data.id);

    const evidenceChunkIds = entity.evidenceChunkIndexes
      .map((idx) => chunkByIndex.get(idx))
      .filter((id): id is string => Boolean(id));

    if (evidenceChunkIds.length > 0) {
      await supabase.from("knowledge_evidence").insert(
        evidenceChunkIds.map((chunkId) => ({
          organization_id: organizationId,
          entity_id: data.id,
          data_source_id: dataSourceId,
          chunk_id: chunkId,
          evidence_text: entity.summary,
          relevance_score: entity.confidence,
        }))
      );
    } else {
      await supabase.from("knowledge_evidence").insert({
        organization_id: organizationId,
        entity_id: data.id,
        data_source_id: dataSourceId,
        chunk_id: null,
        evidence_text: entity.summary,
        relevance_score: entity.confidence,
      });
    }
  }

  // relations ----------------------------------------------------------------
  for (const relation of extraction.relations) {
    const sourceId = entityNameToId.get(relation.source);
    const targetId = entityNameToId.get(relation.target);
    if (!sourceId || !targetId) continue;

    await supabase.from("knowledge_relations").insert({
      organization_id: organizationId,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relation_type: relation.relationType,
      description: relation.description,
      confidence_score: relation.confidence,
      evidence: [{ dataSourceId }],
    });
  }

  // decision rules -------------------------------------------------------
  for (const rule of extraction.decisionRules) {
    await supabase.from("decision_rules").upsert(
      {
        organization_id: organizationId,
        rule_name: rule.name,
        condition_text: rule.condition,
        action_text: rule.action,
        reason_text: rule.reason,
        rule_category: rule.category,
        weight: rule.weight,
        confidence_score: rule.confidence,
        evidence: [{ dataSourceId }],
        is_active: true,
      },
      { onConflict: "organization_id,rule_name" }
    );
  }

  // brand profile ----------------------------------------------------------
  const bp = extraction.brandProfile;
  const hasBrandSignal =
    bp.coreMessage ||
    bp.tone.length ||
    bp.preferredExpressions.length ||
    bp.prohibitedExpressions.length ||
    bp.targetAudiences.length ||
    bp.persuasionStructure.length ||
    bp.expertiseAreas.length;

  if (hasBrandSignal) {
    const { data: existing } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    await supabase.from("brand_profiles").upsert(
      {
        organization_id: organizationId,
        core_message: bp.coreMessage || existing?.core_message || null,
        tone: mergeStringArrays(existing?.tone ?? [], bp.tone),
        preferred_expressions: mergeStringArrays(existing?.preferred_expressions ?? [], bp.preferredExpressions),
        prohibited_expressions: mergeStringArrays(
          existing?.prohibited_expressions ?? [],
          bp.prohibitedExpressions
        ),
        target_audiences: mergeStringArrays(existing?.target_audiences ?? [], bp.targetAudiences),
        persuasion_structure: mergeStringArrays(existing?.persuasion_structure ?? [], bp.persuasionStructure),
        expertise_areas: mergeStringArrays(existing?.expertise_areas ?? [], bp.expertiseAreas),
      },
      { onConflict: "organization_id" }
    );
  }
}

/**
 * Runs the full analysis pipeline for a data source that has already been
 * registered (data_sources row exists). Safe to call again for a retry —
 * knowledge upserts are idempotent by (organization_id, type, name).
 */
export async function runDataSourcePipeline(
  supabase: Client,
  organizationId: string,
  dataSourceId: string
): Promise<void> {
  const { data: source, error: sourceError } = await supabase
    .from("data_sources")
    .select("*")
    .eq("id", dataSourceId)
    .eq("organization_id", organizationId)
    .single();

  if (sourceError || !source) {
    throw new PipelineError("자료를 찾을 수 없습니다.");
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      organization_id: organizationId,
      job_type: "data_source_analysis",
      target_id: dataSourceId,
      status: "running",
      progress: 0,
      current_step: "본문 추출",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new PipelineError("처리 작업을 생성할 수 없습니다.");
  }

  // delete previous chunks/evidence from an earlier run of this source so
  // re-analysis doesn't accumulate stale rows
  await supabase.from("document_chunks").delete().eq("data_source_id", dataSourceId);

  const fail = async (message: string) => {
    await updateJob(supabase, job.id, {
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    await updateSource(supabase, dataSourceId, { status: "failed", error_message: message });
  };

  try {
    // 1. 콘텐츠 추출 ---------------------------------------------------------
    await updateSource(supabase, dataSourceId, { status: "extracting", processing_progress: 10 });
    await updateJob(supabase, job.id, { current_step: "본문 추출", progress: 10 });

    let extractedText = source.extracted_text ?? source.original_text ?? "";

    if (source.source_type === "url") {
      if (!source.source_url) throw new PipelineError("등록된 URL이 없습니다.");
      const result = await fetchAndExtractUrl(source.source_url);
      extractedText = result.textContent;
    } else if (["pdf", "docx"].includes(source.source_type) && source.storage_path) {
      const buffer = await downloadStoredFile(supabase, source.storage_path);
      extractedText = await extractFileText(buffer, source.title);
    } else if (["txt", "markdown"].includes(source.source_type) && source.storage_path) {
      const buffer = await downloadStoredFile(supabase, source.storage_path);
      extractedText = await extractFileText(buffer, source.title);
    } else if (!extractedText) {
      throw new PipelineError("추출할 원문이 없습니다.");
    }

    // 2-3. 데이터 정제 + 정규화 -----------------------------------------------
    await updateSource(supabase, dataSourceId, { status: "chunking", processing_progress: 25 });
    await updateJob(supabase, job.id, { current_step: "데이터 정제 및 정규화", progress: 25 });
    const cleanedText = normalizeText(extractedText);
    await updateSource(supabase, dataSourceId, { extracted_text: cleanedText });

    // 4. 의미 단위 분할 -------------------------------------------------------
    await updateJob(supabase, job.id, { current_step: "의미 단위 분할", progress: 40 });
    const textChunks = chunkText(cleanedText);
    if (textChunks.length === 0) {
      throw new PipelineError("분석 가능한 텍스트가 너무 짧습니다.");
    }

    // 5. 임베딩 생성 ----------------------------------------------------------
    await updateSource(supabase, dataSourceId, { status: "embedding", processing_progress: 55 });
    await updateJob(supabase, job.id, { current_step: "임베딩 생성", progress: 55 });
    const embedded = await embedTexts(textChunks.map((c) => c.content));
    const { embeddingModel: modelName, embeddingDimension } = currentModelNames();

    const { data: insertedChunks, error: chunkInsertError } = await supabase
      .from("document_chunks")
      .insert(
        textChunks.map((chunk, i) => ({
          organization_id: organizationId,
          data_source_id: dataSourceId,
          chunk_index: chunk.index,
          content: chunk.content,
          token_count: chunk.tokenCount,
          embedding: embedded[i].embedding,
          embedding_model: modelName,
          embedding_dimension: embeddingDimension,
        }))
      )
      .select("id, chunk_index");

    if (chunkInsertError || !insertedChunks) {
      throw new PipelineError("청크 저장에 실패했습니다: " + chunkInsertError?.message);
    }

    // 6-8. 지식 요소/관계/의사결정 규칙 추출 ------------------------------------
    await updateSource(supabase, dataSourceId, { status: "analyzing", processing_progress: 70 });
    await updateJob(supabase, job.id, { current_step: "지식 요소 및 관계 추출", progress: 70 });

    const extraction = await extractKnowledgeFromChunks({
      organizationName: org?.name ?? "",
      dataSourceTitle: source.title,
      dataSourceType: source.source_type,
      chunks: textChunks.map((c) => ({ index: c.index, content: c.content })),
    });

    // 9. 브랜드 프로필 업데이트 --------------------------------------------
    await updateJob(supabase, job.id, { current_step: "브랜드 프로필 업데이트", progress: 90 });
    await persistKnowledge(supabase, organizationId, dataSourceId, insertedChunks, extraction);

    // 10. 완료 --------------------------------------------------------------
    await updateSource(supabase, dataSourceId, {
      status: "completed",
      processing_progress: 100,
      error_message: null,
    });
    await updateJob(supabase, job.id, {
      status: "completed",
      progress: 100,
      current_step: "분석 완료",
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof UrlAnalysisError || error instanceof FileExtractionError || error instanceof PipelineError
        ? error.message
        : "분석 중 알 수 없는 오류가 발생했습니다.";
    await fail(message);
    throw error;
  }
}
