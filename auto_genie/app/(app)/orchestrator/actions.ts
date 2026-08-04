"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";
import { generateContentForPlatform } from "@/lib/ai/generate-content";
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
