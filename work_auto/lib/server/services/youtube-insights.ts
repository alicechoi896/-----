import "server-only";
import type { YouTubeTopicSuggestion, YouTubeTrendItem, YouTubeVideoAnalysis } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { savedTrendService } from "./saved-trends";

const strArray = { type: "array", items: { type: "string" } } as const;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasons", "titleSuggestions", "keywords"],
  properties: { reasons: strArray, titleSuggestions: strArray, keywords: strArray },
} as const;

const TOPICS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topics"],
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "angle", "keywords", "format"],
        properties: { title: { type: "string" }, angle: { type: "string" }, keywords: strArray, format: { type: "string", enum: ["shorts", "long"] } },
      },
    },
  },
} as const;

/** AI 에 보내는 영상 정보 (클라이언트가 보낸 값을 잘라서 쓴다) */
type VideoInput = Pick<
  YouTubeTrendItem,
  "videoId" | "title" | "channelName" | "channelSubscribers" | "views" | "viewsPerDay" | "commentCount" | "likeCount" | "publishedAt" | "durationSec" | "format" | "tags" | "description"
>;

function cleanVideo(v: Partial<YouTubeTrendItem>): VideoInput {
  if (!v || typeof v.title !== "string" || !v.title.trim()) throw new AppError("VALIDATION", "분석할 영상 정보가 없습니다.");
  const num = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
  return {
    videoId: String(v.videoId ?? "").slice(0, 20),
    title: v.title.slice(0, 200),
    channelName: String(v.channelName ?? "").slice(0, 100),
    channelSubscribers: num(v.channelSubscribers),
    views: num(v.views),
    viewsPerDay: num(v.viewsPerDay),
    commentCount: v.commentCount == null ? null : num(v.commentCount),
    likeCount: v.likeCount == null ? null : num(v.likeCount),
    publishedAt: String(v.publishedAt ?? ""),
    durationSec: num(v.durationSec),
    format: v.format === "shorts" ? "shorts" : "long",
    tags: Array.isArray(v.tags) ? v.tags.map(String).slice(0, 30) : [],
    description: String(v.description ?? "").slice(0, 500),
  };
}

const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, n) : []);

/** YouTube 트렌드 AI 분석 (영상 1개 분석, 추천 주제) */
export const youtubeInsightService = {
  async analyzeVideo(input: Partial<YouTubeTrendItem>): Promise<YouTubeVideoAnalysis & { provider: string }> {
    const video = cleanVideo(input);
    const template = getPromptTemplate("youtube.video-analysis");
    const ratio = video.views / Math.max(video.channelSubscribers, 1);
    const lines = [
      `제목: ${video.title}`,
      `채널: ${video.channelName} (구독자 ${video.channelSubscribers.toLocaleString("ko-KR")}명)`,
      `조회수: ${video.views.toLocaleString("ko-KR")}회 (구독자 대비 ${ratio.toFixed(1)}배, 일평균 ${video.viewsPerDay.toLocaleString("ko-KR")}회)`,
      `좋아요: ${video.likeCount == null ? "비공개" : video.likeCount.toLocaleString("ko-KR")} / 댓글: ${video.commentCount == null ? "사용 안 함" : video.commentCount.toLocaleString("ko-KR")}`,
      `게시일: ${video.publishedAt.slice(0, 10)} / 길이: ${formatDuration(video.durationSec)} (${video.format === "shorts" ? "Shorts" : "롱폼"})`,
      `태그: ${video.tags.join(", ") || "(없음)"}`,
      `설명(앞부분): ${video.description || "(없음)"}`,
    ];
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "youtube-video-analysis",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: `${template.task}\n\n[영상 정보]\n${lines.join("\n")}` },
      ],
      outputKeys: ["reasons", "titleSuggestions", "keywords"],
      jsonSchema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      variables: { video },
      maxTokens: 2000,
    });
    const analysis: YouTubeVideoAnalysis = {
      reasons: list(result.data.reasons, 6),
      titleSuggestions: list(result.data.titleSuggestions, 8),
      keywords: list(result.data.keywords, 12),
    };
    if (!analysis.reasons.length) throw new AppError("AI_BAD_OUTPUT", "분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
    if (video.videoId) await savedTrendService.attachAnalysis(video.videoId, analysis).catch(() => undefined);
    return { ...analysis, provider: `${result.provider}/${result.model}` };
  },

  async suggestTopics(input: { videos?: Partial<YouTubeTrendItem>[]; keywords?: string[] }): Promise<{ topics: YouTubeTopicSuggestion[]; provider: string }> {
    const videos = (Array.isArray(input.videos) ? input.videos : []).slice(0, 40).map(cleanVideo);
    if (videos.length < 3) throw new AppError("VALIDATION", "주제를 추천하려면 영상을 3개 이상 불러와 주세요.");
    const keywords = list(input.keywords, 15);
    const template = getPromptTemplate("youtube.trend-topics");
    const rows = videos.map(
      (v, i) =>
        `${i + 1}. ${v.title} | ${v.format === "shorts" ? "Shorts" : "롱폼"} | 일평균 ${v.viewsPerDay.toLocaleString("ko-KR")}회 | 구독자 ${v.channelSubscribers.toLocaleString("ko-KR")} | 태그: ${v.tags.slice(0, 6).join(", ")}`,
    );
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "youtube-trend-topics",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: `${template.task}\n\n[많이 나온 키워드]\n${keywords.join(", ") || "(없음)"}\n\n[트렌드 영상]\n${rows.join("\n")}` },
      ],
      outputKeys: ["topics"],
      jsonSchema: TOPICS_SCHEMA as unknown as Record<string, unknown>,
      variables: { videos, keywords },
      maxTokens: 2500,
    });
    const raw = Array.isArray(result.data.topics) ? (result.data.topics as Record<string, unknown>[]) : [];
    const topics = raw
      .map((t) => ({
        title: String(t.title ?? "").trim(),
        angle: String(t.angle ?? "").trim(),
        keywords: list(t.keywords, 6),
        format: t.format === "shorts" ? ("shorts" as const) : ("long" as const),
      }))
      .filter((t) => t.title)
      .slice(0, 8);
    if (!topics.length) throw new AppError("AI_BAD_OUTPUT", "추천 결과 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
    return { topics, provider: `${result.provider}/${result.model}` };
  },
};
