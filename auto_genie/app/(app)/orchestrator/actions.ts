"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";
import { generateContentForPlatform } from "@/lib/ai/generate-content";
import { analyzeContentFit } from "@/lib/ai/analyze-content-fit";
import type { ContentFitAnalysis } from "@/lib/ai/schemas";
import { renderPlatformContent } from "@/lib/content/render";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Database, Platform } from "@/types/database";

const PLATFORMS: Platform[] = [
  "naver_blog",
  "instagram",
  "threads",
  "youtube_shorts",
  "newsletter",
  "landing_page",
];

export async function ensureContentProjectAction(
  strategyOptionId: string
): Promise<{ projectId: string | null; error: string | null }> {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("content_projects")
    .select("id")
    .eq("organization_id", org.id)
    .eq("strategy_option_id", strategyOptionId)
    .maybeSingle();

  if (existing) return { projectId: existing.id, error: null };

  const { data: option, error: optionError } = await supabase
    .from("strategy_options")
    .select("*, strategy_runs(campaign_id)")
    .eq("id", strategyOptionId)
    .eq("organization_id", org.id)
    .single();

  if (optionError || !option) return { projectId: null, error: "전략을 찾을 수 없습니다." };

  const campaignId = (option as unknown as { strategy_runs: { campaign_id: string } | null }).strategy_runs
    ?.campaign_id;

  const { data: project, error } = await supabase
    .from("content_projects")
    .insert({
      organization_id: org.id,
      campaign_id: campaignId ?? null,
      strategy_option_id: strategyOptionId,
      title: option.title,
      core_message: option.core_message,
      target_audience: option.target_problem,
      objective: option.funnel_step,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !project) return { projectId: null, error: "콘텐츠 프로젝트 생성에 실패했습니다." };

  return { projectId: project.id, error: null };
}

const generateSchema = z.object({
  contentProjectId: z.string().uuid(),
  platforms: z.array(z.enum(PLATFORMS as [Platform, ...Platform[]])).min(1),
});

export async function generateContentAction(
  contentProjectId: string,
  platforms: string[]
): Promise<{ error: string | null }> {
  const parsed = generateSchema.safeParse({ contentProjectId, platforms });
  if (!parsed.success) return { error: "생성할 플랫폼을 선택하세요." };

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`content:${org.id}`, 15);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("content_projects")
    .select("*, strategy_options(*)")
    .eq("id", contentProjectId)
    .eq("organization_id", org.id)
    .single();
  if (!project) return { error: "콘텐츠 프로젝트를 찾을 수 없습니다." };

  const strategyOption = (
    project as unknown as { strategy_options: Database["public"]["Tables"]["strategy_options"]["Row"] | null }
  ).strategy_options;

  const { data: org2 } = await supabase.from("organizations").select("name").eq("id", org.id).single();
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("core_message, prohibited_expressions")
    .eq("organization_id", org.id)
    .maybeSingle();
  const { data: rules } = await supabase
    .from("decision_rules")
    .select("rule_name, action_text")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .limit(5);

  const context = {
    organizationName: org2?.name ?? "",
    strategyTitle: project.title,
    targetProblem: strategyOption?.target_problem ?? null,
    coreMessage: project.core_message,
    contentDirection: strategyOption?.content_direction ?? null,
    funnelStep: project.objective,
    productName: null,
    audience: strategyOption?.target_problem ?? null,
    brandCoreMessage: brandProfile?.core_message ?? null,
    prohibitedExpressions: Array.isArray(brandProfile?.prohibited_expressions)
      ? (brandProfile!.prohibited_expressions as string[])
      : [],
    decisionRuleHints: (rules ?? []).map((r) => `${r.rule_name}: ${r.action_text}`),
  };

  await supabase.from("content_projects").update({ status: "generating" }).eq("id", contentProjectId);

  const errors: string[] = [];

  for (const platform of parsed.data.platforms) {
    try {
      const structured = await generateContentForPlatform(platform, context);
      const rendered = renderPlatformContent(platform, structured);

      const { data: existingOutput } = await supabase
        .from("content_outputs")
        .select("id, generation_metadata")
        .eq("content_project_id", contentProjectId)
        .eq("platform", platform)
        .maybeSingle();

      const meta = (existingOutput?.generation_metadata as Record<string, unknown>) ?? {};
      const versions = Array.isArray(meta.versions) ? (meta.versions as unknown[]) : [];
      if (existingOutput) {
        versions.push({ structured: meta.structured ?? null, generatedAt: meta.generatedAt ?? null });
      }

      const newMeta = {
        structured,
        original: meta.original ?? structured,
        versions,
        generatedAt: new Date().toISOString(),
        model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      } as unknown as Database["public"]["Tables"]["content_outputs"]["Row"]["generation_metadata"];

      if (existingOutput) {
        await supabase
          .from("content_outputs")
          .update({
            title: rendered.title,
            body: rendered.body,
            hook: rendered.hook,
            call_to_action: rendered.callToAction,
            hashtags: rendered.hashtags,
            seo_keywords: rendered.seoKeywords,
            generation_metadata: newMeta,
            status: "generated",
          })
          .eq("id", existingOutput.id);
      } else {
        await supabase.from("content_outputs").insert({
          organization_id: org.id,
          content_project_id: contentProjectId,
          platform,
          title: rendered.title,
          body: rendered.body,
          hook: rendered.hook,
          call_to_action: rendered.callToAction,
          hashtags: rendered.hashtags,
          seo_keywords: rendered.seoKeywords,
          generation_metadata: newMeta,
          status: "generated",
        });
      }
    } catch (error) {
      errors.push(`${platform}: ${error instanceof Error ? error.message : "생성 실패"}`);
    }
  }

  await supabase
    .from("content_projects")
    .update({ status: errors.length === parsed.data.platforms.length ? "draft" : "ready" })
    .eq("id", contentProjectId);

  revalidatePath("/orchestrator");
  return { error: errors.length > 0 ? errors.join(" / ") : null };
}

const updateSchema = z.object({
  outputId: z.string().uuid(),
  title: z.string().max(300).optional(),
  body: z.string().max(50_000),
  hook: z.string().max(500).optional(),
  callToAction: z.string().max(300).optional(),
});

export async function updateContentOutputAction(formData: FormData): Promise<{ error: string | null }> {
  const parsed = updateSchema.safeParse({
    outputId: formData.get("outputId"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    hook: formData.get("hook") || undefined,
    callToAction: formData.get("callToAction") || undefined,
  });
  if (!parsed.success) return { error: "수정 내용을 확인하세요." };

  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("content_outputs")
    .select("*")
    .eq("id", parsed.data.outputId)
    .eq("organization_id", org.id)
    .single();
  if (!before) return { error: "콘텐츠를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("content_outputs")
    .update({
      title: parsed.data.title ?? before.title,
      body: parsed.data.body,
      hook: parsed.data.hook ?? before.hook,
      call_to_action: parsed.data.callToAction ?? before.call_to_action,
      status: "edited",
    })
    .eq("id", parsed.data.outputId);
  if (error) return { error: "저장에 실패했습니다: " + error.message };

  const oldLen = (before.body ?? "").length;
  const newLen = parsed.data.body.length;
  const changeRatio = oldLen === 0 ? 1 : Math.abs(newLen - oldLen) / oldLen;

  await supabase.from("learning_events").insert({
    organization_id: org.id,
    event_type: "content_edited",
    target_type: "content_outputs",
    target_id: parsed.data.outputId,
    before_state: { body: before.body },
    after_state: { body: parsed.data.body },
    description: `콘텐츠를 직접 수정했습니다 (변경량 약 ${Math.round(changeRatio * 100)}%).`,
  });

  await supabase.from("audit_logs").insert({
    organization_id: org.id,
    user_id: user.id,
    action: "update",
    entity_type: "content_outputs",
    entity_id: parsed.data.outputId,
    metadata: { changeRatio },
  });

  revalidatePath("/orchestrator");
  return { error: null };
}

export async function deleteContentOutputAction(outputId: string): Promise<void> {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();
  await supabase.from("content_outputs").delete().eq("id", outputId).eq("organization_id", org.id);
  revalidatePath("/orchestrator");
}

// ---------------------------------------------------------------------------
// 직접 콘텐츠 등록 + 전략 적합도 분석
// 전략에서 AI가 생성해주는 흐름과 별개로, 사용자가 이미 써 둔 콘텐츠를 그대로
// 등록하고 원하면 나중에 전략을 연결해 적합도 분석을 받을 수 있게 한다.
// ---------------------------------------------------------------------------

const standaloneProjectSchema = z.object({
  title: z.string().min(1).max(200),
  coreMessage: z.string().max(500).optional(),
  targetAudience: z.string().max(300).optional(),
});

export type StandaloneProjectState = { error: string | null };

export async function createStandaloneContentProjectAction(
  _prev: StandaloneProjectState,
  formData: FormData
): Promise<StandaloneProjectState> {
  const parsed = standaloneProjectSchema.safeParse({
    title: formData.get("title"),
    coreMessage: formData.get("coreMessage") || undefined,
    targetAudience: formData.get("targetAudience") || undefined,
  });
  if (!parsed.success) return { error: "콘텐츠 프로젝트명을 입력하세요." };

  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("content_projects")
    .insert({
      organization_id: org.id,
      campaign_id: null,
      strategy_option_id: null,
      title: parsed.data.title,
      core_message: parsed.data.coreMessage ?? null,
      target_audience: parsed.data.targetAudience ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !project) return { error: "콘텐츠 프로젝트 생성에 실패했습니다: " + error?.message };

  revalidatePath("/orchestrator");
  redirect(`/orchestrator?projectId=${project.id}`);
}

const manualContentSchema = z.object({
  contentProjectId: z.string().uuid(),
  platform: z.enum(PLATFORMS as [Platform, ...Platform[]]),
  title: z.string().min(1).max(300),
  hook: z.string().max(500).optional(),
  body: z.string().min(1).max(50_000),
  callToAction: z.string().max(300).optional(),
  hashtags: z.string().max(500).optional(),
});

export type ManualContentState = { error: string | null };

export async function registerManualContentAction(
  _prev: ManualContentState,
  formData: FormData
): Promise<ManualContentState> {
  const parsed = manualContentSchema.safeParse({
    contentProjectId: formData.get("contentProjectId"),
    platform: formData.get("platform"),
    title: formData.get("title"),
    hook: formData.get("hook") || undefined,
    body: formData.get("body"),
    callToAction: formData.get("callToAction") || undefined,
    hashtags: formData.get("hashtags") || undefined,
  });
  if (!parsed.success) return { error: "플랫폼, 제목, 본문을 정확히 입력하세요." };

  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("content_projects")
    .select("id")
    .eq("id", parsed.data.contentProjectId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!project) return { error: "콘텐츠 프로젝트를 찾을 수 없습니다." };

  const hashtags = parsed.data.hashtags
    ? parsed.data.hashtags.split(",").map((h) => h.trim()).filter(Boolean)
    : [];

  const { error } = await supabase.from("content_outputs").insert({
    organization_id: org.id,
    content_project_id: parsed.data.contentProjectId,
    platform: parsed.data.platform,
    title: parsed.data.title,
    body: parsed.data.body,
    hook: parsed.data.hook ?? null,
    call_to_action: parsed.data.callToAction ?? null,
    hashtags,
    seo_keywords: [],
    generation_metadata: { manual: true, registeredAt: new Date().toISOString() },
    status: "final",
  });
  if (error) return { error: "콘텐츠 등록에 실패했습니다: " + error.message };

  await supabase
    .from("content_projects")
    .update({ status: "ready" })
    .eq("id", parsed.data.contentProjectId);

  revalidatePath("/orchestrator");
  return { error: null };
}

const linkStrategySchema = z.object({
  contentProjectId: z.string().uuid(),
  strategyOptionId: z.string().uuid(),
});

export async function linkStrategyToProjectAction(formData: FormData): Promise<{ error: string | null }> {
  const parsed = linkStrategySchema.safeParse({
    contentProjectId: formData.get("contentProjectId"),
    strategyOptionId: formData.get("strategyOptionId"),
  });
  if (!parsed.success) return { error: "연결할 전략을 선택하세요." };

  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: option } = await supabase
    .from("strategy_options")
    .select("id, strategy_runs(campaign_id)")
    .eq("id", parsed.data.strategyOptionId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!option) return { error: "전략을 찾을 수 없습니다." };

  const campaignId = (option as unknown as { strategy_runs: { campaign_id: string } | null }).strategy_runs
    ?.campaign_id;

  const { error } = await supabase
    .from("content_projects")
    .update({ strategy_option_id: parsed.data.strategyOptionId, campaign_id: campaignId ?? null })
    .eq("id", parsed.data.contentProjectId)
    .eq("organization_id", org.id);
  if (error) return { error: "전략 연결에 실패했습니다: " + error.message };

  revalidatePath("/orchestrator");
  return { error: null };
}

export async function analyzeContentFitAction(outputId: string): Promise<{ error: string | null }> {
  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`content-fit:${org.id}`, 15);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  const { data: output } = await supabase
    .from("content_outputs")
    .select("*, content_projects(*, strategy_options(*))")
    .eq("id", outputId)
    .eq("organization_id", org.id)
    .single();
  if (!output) return { error: "콘텐츠를 찾을 수 없습니다." };

  const project = (
    output as unknown as {
      content_projects:
        | (Database["public"]["Tables"]["content_projects"]["Row"] & {
            strategy_options: Database["public"]["Tables"]["strategy_options"]["Row"] | null;
          })
        | null;
    }
  ).content_projects;

  const strategyOption = project?.strategy_options ?? null;
  if (!strategyOption) {
    return { error: "이 콘텐츠에 연결된 전략이 없습니다. 먼저 전략을 연결하세요." };
  }

  const { data: org2 } = await supabase.from("organizations").select("name").eq("id", org.id).single();
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("core_message, prohibited_expressions")
    .eq("organization_id", org.id)
    .maybeSingle();

  let analysis: ContentFitAnalysis;
  try {
    analysis = await analyzeContentFit({
      organizationName: org2?.name ?? "",
      strategyTitle: strategyOption.title,
      targetProblem: strategyOption.target_problem,
      coreMessage: strategyOption.core_message,
      contentDirection: strategyOption.content_direction,
      brandCoreMessage: brandProfile?.core_message ?? null,
      prohibitedExpressions: Array.isArray(brandProfile?.prohibited_expressions)
        ? (brandProfile!.prohibited_expressions as string[])
        : [],
      platform: output.platform,
      contentTitle: output.title,
      contentBody: output.body ?? "",
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "적합도 분석 중 오류가 발생했습니다." };
  }

  const meta = (output.generation_metadata as Record<string, unknown>) ?? {};
  const { error } = await supabase
    .from("content_outputs")
    .update({ generation_metadata: { ...meta, fitAnalysis: analysis, fitAnalyzedAt: new Date().toISOString() } })
    .eq("id", outputId);
  if (error) return { error: "분석 결과 저장에 실패했습니다: " + error.message };

  revalidatePath("/orchestrator");
  return { error: null };
}
