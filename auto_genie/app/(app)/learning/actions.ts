"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { runDataSourcePipeline } from "@/lib/pipeline/data-source-pipeline";
import { validateFile, ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from "@/lib/ingestion/file-extract";
import { assertPublicUrl, UrlNotAllowedError } from "@/lib/ingestion/ssrf";
import { checkRateLimit } from "@/lib/rate-limit";

export type ActionState = { error: string | null; sourceId?: string };

const CONTENT_CATEGORIES = [
  "상품정보",
  "회사소개",
  "강의자료",
  "기존 콘텐츠",
  "고객 질문",
  "고객 후기",
  "상담 기록",
  "마케팅 노하우",
  "브랜드 가이드",
] as const;

const urlSchema = z.object({
  url: z.string().url().max(2000),
  category: z.enum(CONTENT_CATEGORIES),
  title: z.string().min(1).max(200),
  purpose: z.string().max(500).optional(),
});

const textSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(10).max(200_000),
  category: z.enum(CONTENT_CATEGORIES),
});

export async function registerUrlSourceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = urlSchema.safeParse({
    url: formData.get("url"),
    category: formData.get("category"),
    title: formData.get("title"),
    purpose: formData.get("purpose") || undefined,
  });
  if (!parsed.success) {
    return { error: "URL, 자료명, 자료 유형을 정확히 입력하세요." };
  }

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`register:${org.id}`);
  if (!limited.ok) return { error: limited.message };

  try {
    await assertPublicUrl(parsed.data.url);
  } catch (error) {
    return { error: error instanceof UrlNotAllowedError ? error.message : "URL을 확인할 수 없습니다." };
  }

  const supabase = await createClient();

  const { data: duplicate } = await supabase
    .from("data_sources")
    .select("id, title")
    .eq("organization_id", org.id)
    .eq("source_url", parsed.data.url)
    .maybeSingle();

  if (duplicate) {
    return { error: `이미 등록된 URL입니다 ("${duplicate.title}"). 목록에서 다시 분석을 실행하세요.` };
  }

  const { data, error } = await supabase
    .from("data_sources")
    .insert({
      organization_id: org.id,
      source_type: "url",
      title: parsed.data.title,
      source_url: parsed.data.url,
      status: "pending",
      metadata: { category: parsed.data.category, purpose: parsed.data.purpose ?? null },
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "자료 등록에 실패했습니다: " + error?.message };
  }

  revalidatePath("/learning");
  return { error: null, sourceId: data.id };
}

export async function registerTextSourceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = textSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    category: formData.get("category"),
  });
  if (!parsed.success) {
    return { error: "제목과 본문(10자 이상), 자료 유형을 정확히 입력하세요." };
  }

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`register:${org.id}`);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_sources")
    .insert({
      organization_id: org.id,
      source_type: "text",
      title: parsed.data.title,
      original_text: parsed.data.body,
      status: "pending",
      metadata: { category: parsed.data.category },
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "자료 등록에 실패했습니다: " + error?.message };
  }

  revalidatePath("/learning");
  return { error: null, sourceId: data.id };
}

export async function registerFileSourceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const file = formData.get("file");
  const category = formData.get("category");
  const title = formData.get("title");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택하세요." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "자료명을 입력하세요." };
  }
  if (typeof category !== "string" || !CONTENT_CATEGORIES.includes(category as (typeof CONTENT_CATEGORIES)[number])) {
    return { error: "자료 유형을 선택하세요." };
  }

  try {
    validateFile({ size: file.size, name: file.name, type: file.type });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "지원하지 않는 파일입니다." };
  }

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`register:${org.id}`);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  const { data: duplicate } = await supabase
    .from("data_sources")
    .select("id")
    .eq("organization_id", org.id)
    .eq("title", title)
    .in("source_type", ["pdf", "docx", "txt", "markdown"])
    .maybeSingle();

  if (duplicate) {
    return { error: "같은 이름의 파일이 이미 등록되어 있습니다." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const sourceType = ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : ext === "md" ? "markdown" : "txt";
  const storagePath = `${org.id}/${crypto.randomUUID()}-${file.name}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("data-source-files")
    .upload(storagePath, arrayBuffer, { contentType: file.type });

  if (uploadError) {
    return { error: "파일 업로드에 실패했습니다: " + uploadError.message };
  }

  const { data, error } = await supabase
    .from("data_sources")
    .insert({
      organization_id: org.id,
      source_type: sourceType,
      title,
      storage_path: storagePath,
      status: "pending",
      metadata: { category, originalFileName: file.name, sizeBytes: file.size },
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "자료 등록에 실패했습니다: " + error?.message };
  }

  revalidatePath("/learning");
  return { error: null, sourceId: data.id };
}

export async function startAnalysisAction(dataSourceId: string): Promise<ActionState> {
  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`analyze:${org.id}`);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  try {
    await runDataSourcePipeline(supabase, org.id, dataSourceId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "분석 중 오류가 발생했습니다." };
  } finally {
    revalidatePath("/learning");
    revalidatePath("/brain");
    revalidatePath("/dashboard");
  }

  return { error: null, sourceId: dataSourceId };
}

export async function deleteDataSourceAction(dataSourceId: string): Promise<void> {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();
  await supabase.from("data_sources").delete().eq("id", dataSourceId).eq("organization_id", org.id);
  revalidatePath("/learning");
}

export const dataSourceMaxFileBytes = MAX_FILE_BYTES;
export const acceptedFileTypes = ACCEPTED_FILE_TYPES;
export const contentCategories = CONTENT_CATEGORIES;
