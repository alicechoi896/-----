import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import type { GeneratedContent, ReferenceVideo } from "@/lib/types";
import type { VideoChannel, VideoJob, VideoPlan, VideoSourceMode } from "@/lib/types/video-production";
import { VIDEO_RENDER_CONFIG, VIDEO_SCRIPT_FEATURES, VOICE_OPTIONS, VOICE_STYLES, atempoChain, cleanCaptionStyle, cleanPause, cleanTarget, cleanTitleStyle, cleanVoiceSpeed, targetFromLength, voiceInstructions } from "@/lib/video-production/config";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider, getTTSProvider, getTypecastProvider } from "../providers/registry";
import { TYPECAST_EMOTIONS, TYPECAST_VOICE_ID, type TypecastVoice } from "../providers/tts/typecast";
import { getActorId, getCurrentUserId, getRepositories } from "../repositories";
import { sfxName, videoAssets } from "./assets";
import { assignSources, buildPlan } from "./planner";
import { renderVideo } from "./render";
import { videoStorage } from "./storage";

/**
 * 영상 자동 제작 서비스 (v0.9.51). docs/VIDEO_PRODUCTION.md
 * 흐름: 대본 고르기 → [컷 계획 만들기](AI 1회: 화면용 제목) → 컷 확인·클립 교체 → [영상 만들기] → 렌더(백그라운드) → 자동 검사 → 검수·승인
 * 영상 제작 중 외부 API: TikHub 검색·Bright Data·YouTube·NAVER = 0. AI 는 이미지 읽기(원본 글자)·음성·화면용 제목만.
 * 재렌더(클립 교체·설정 변경)는 컷 계획을 다시 AI 로 만들지 않는다.
 */
const IN_PROGRESS: VideoJob["status"][] = ["queued", "analyzing", "editing", "rendering", "quality_check"];
const STALE_MS = 10 * 60 * 1000;
const KEEP_AFTER_DOWNLOAD_MS = 60 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const fileKey = (j: Pick<VideoJob, "userId" | "id">) => `${j.userId}/${j.id}.mp4`;

/** 음성 엔진·목소리 검사 (v0.9.73): 타입캐스트면 tc_…/uc_… id, 아니면 OpenAI 목소리 */
function cleanVoice(engine: unknown, voice: unknown): { ttsEngine: "openai" | "typecast"; voice: string } {
  if (engine === "typecast" && typeof voice === "string" && TYPECAST_VOICE_ID.test(voice)) return { ttsEngine: "typecast", voice };
  return { ttsEngine: "openai", voice: VOICE_OPTIONS.some((v) => v.value === voice) ? String(voice) : VOICE_OPTIONS[0].value };
}
const cleanEmotion = (v: unknown) => (TYPECAST_EMOTIONS.some((e) => e.value === v) ? String(v) : "normal");
let tcVoices: { at: number; list: TypecastVoice[] } | null = null;

async function ownJob(id: string): Promise<VideoJob> {
  const userId = await getCurrentUserId();
  const job = await getRepositories().videoJobs.get(String(id));
  if (!job || job.userId !== userId) throw new AppError("NOT_FOUND", "영상 작업을 찾을 수 없습니다.", 404);
  return job;
}

/** 내 샤오홍슈 영상 (제품 연결 영상 먼저) */
async function myVideos(userId: string, productId: string | null): Promise<ReferenceVideo[]> {
  const rows = await getRepositories().videos.list((v) => v.userId === userId && v.platform === "xiaohongshu");
  return rows.sort((a, b) => Number(b.productId === productId) - Number(a.productId === productId) || b.createdAt.localeCompare(a.createdAt));
}

export const videoJobService = {
  /** 화면 준비: 고를 수 있는 대본(2단계 결과)·영상 소재·자료 상태 */
  async options(channelId: VideoChannel) {
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const features = new Set(VIDEO_SCRIPT_FEATURES[channelId]);
    const contents = (await repo.contents.list((c) => c.userId === userId && features.has(c.featureId) && Array.isArray(c.output.script)))
      .filter((c) => c.context.workflow?.stage !== 1)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);
    const videos = await myVideos(userId, null);
    const [ai, tts, typecast] = await Promise.all([getAIProvider(), getTTSProvider(), getTTSProvider("typecast").catch(() => null)]);
    return {
      contents: contents.map((c) => ({
        id: c.id,
        featureId: c.featureId,
        headline: c.headline,
        productId: c.productId,
        productName: c.context.product?.name ?? null,
        scripts: ((c.context.userEdits?.script?.value ?? c.output.script) as string[]).slice(0, 12),
        targetSec: targetFromLength(c.input?.length),
        createdAt: c.createdAt,
      })),
      videos: videos.slice(0, 200).map((v) => ({ id: v.id, title: v.title, thumbnailUrl: v.thumbnailUrl ?? null, durationSec: v.durationSec, productId: v.productId ?? null })),
      assets: videoAssets.summary(),
      ready: { voice: Boolean(tts), vision: ai.supportsVision, ai: ai.id, typecast: Boolean(typecast) },
      typecastEmotions: TYPECAST_EMOTIONS,
      voices: VOICE_OPTIONS,
      voiceStyles: VOICE_STYLES.map((v) => ({ value: v.value, label: v.label })),
    };
  },

  /** 컷 계획 (AI 1회 — 화면용 짧은 제목) */
  async plan(input: { contentId?: unknown; scriptIndex?: unknown; channelId?: unknown; sourceMode?: unknown; videoIds?: unknown; voice?: unknown; narrationOn?: unknown; captions?: unknown; aiCount?: unknown; voiceStyle?: unknown; voiceSpeed?: unknown; targetSec?: unknown; maxPauseSec?: unknown; ttsEngine?: unknown; ttsEmotion?: unknown; captionStyle?: unknown; titleStyle?: unknown; aiPrompt?: unknown; scriptText?: unknown }): Promise<{ plan: VideoPlan; aiCalls: number }> {
    const userId = await getCurrentUserId();
    const channelId: VideoChannel = input.channelId === "naver-clip" ? "naver-clip" : "youtube";
    // v0.9.71: AI 영상 생성(AI 컷)은 뺐다 — 고른 샤오홍슈 영상만으로 만든다
    const sourceMode: VideoSourceMode = "xhs";
    const content = await getRepositories().contents.get(String(input.contentId ?? ""));
    if (!content || content.userId !== userId) throw new AppError("NOT_FOUND", "대본을 찾을 수 없습니다.", 404);
    if (!VIDEO_SCRIPT_FEATURES[channelId].includes(content.featureId)) throw new AppError("VALIDATION", "이 채널의 영상 원고가 아닙니다.");
    // 제품이 있는 원고면 그 제품에 연결된 영상만 쓴다 (v0.9.52)
    const all = (await myVideos(userId, content.productId)).filter((v) => !content.productId || v.productId === content.productId);
    const want = new Set((Array.isArray(input.videoIds) ? input.videoIds : []).map(String));
    const picked = want.size ? all.filter((v) => want.has(v.id)) : all.slice(0, 8);
    if (!picked.length)
      throw new AppError("NO_SOURCE", content.productId ? "이 제품에 연결된 샤오홍슈 영상이 없습니다. 영상 URL 가져오기에서 이 제품을 연결해 영상을 담아 주세요." : "샤오홍슈 영상이 없습니다. 영상 URL 가져오기에서 먼저 영상을 담아 주세요.", 400);
    const { ttsEngine, voice } = cleanVoice(input.ttsEngine, input.voice);
    const built = await buildPlan({ content: content as GeneratedContent, scriptIndex: Number(input.scriptIndex ?? 0), channelId, sourceMode, videos: picked, voice, narrationOn: input.narrationOn !== false, captions: input.captions !== false, scriptText: typeof input.scriptText === "string" ? input.scriptText : undefined });
    // 말투·자막 스타일·AI 공통 프롬프트 (v0.9.63)
    built.plan.voiceStyle = VOICE_STYLES.some((v) => v.value === input.voiceStyle) ? String(input.voiceStyle) : VOICE_STYLES[0].value;
    built.plan.captionStyle = cleanCaptionStyle(input.captionStyle);
    built.plan.titleStyle = cleanTitleStyle(input.titleStyle);
    built.plan.voiceSpeed = cleanVoiceSpeed(input.voiceSpeed);
    built.plan.maxPauseSec = cleanPause(input.maxPauseSec);
    built.plan.ttsEngine = ttsEngine;
    built.plan.ttsEmotion = cleanEmotion(input.ttsEmotion);
    built.plan.targetSec = input.targetSec === undefined ? targetFromLength(content.input?.length) : cleanTarget(input.targetSec);
    return built;
  },

  /** 계획 검사 (사용자가 고친 계획을 그대로 믿지 않는다) */
  /** 타입캐스트 목소리 목록 (무료, 1시간 기억) */
  async typecastVoices(): Promise<TypecastVoice[]> {
    await getCurrentUserId();
    if (tcVoices && Date.now() - tcVoices.at < 60 * 60 * 1000) return tcVoices.list;
    const tc = await getTypecastProvider();
    if (!tc) throw new AppError("TYPECAST_NOT_CONNECTED", "타입캐스트가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 타입캐스트 키를 넣어 주세요.", 409);
    const list = await tc.listVoices().catch((e: Error) => {
      throw new AppError("TYPECAST_ERROR", e.message, 502);
    });
    tcVoices = { at: Date.now(), list };
    return list;
  },

  /** 목소리 미리 듣기 (OpenAI 또는 타입캐스트 1회) */
  async voicePreview(input: { voice?: unknown; voiceStyle?: unknown; voiceSpeed?: unknown; text?: unknown; ttsEngine?: unknown; ttsEmotion?: unknown }): Promise<Buffer> {
    await getCurrentUserId();
    const { ttsEngine, voice } = cleanVoice(input.ttsEngine, input.voice);
    const tts = await getTTSProvider(ttsEngine);
    if (!tts) throw new AppError("TTS_NOT_CONNECTED", `AI 음성을 들으려면 API 연결 센터에서 ${ttsEngine === "typecast" ? "타입캐스트" : "OpenAI"} 키를 연결해 주세요.`, 409);
    const text = String(input.text ?? "").trim().slice(0, 80) || "이거 하나면 청소 끝이에요. 진짜 써 보면 알아요.";
    const mp3 = await tts.synthesize(text, voice, voiceInstructions(String(input.voiceStyle ?? "")), { emotion: cleanEmotion(input.ttsEmotion) }).catch((e: Error) => {
      throw new AppError("TTS_ERROR", e.message, 502);
    });
    const chain = atempoChain(input.voiceSpeed);
    if (!chain) return mp3;
    // 영상과 같은 속도로 들려준다 (FFmpeg atempo, 임시 파일은 바로 지움)
    const dir = await mkdtemp(path.join(os.tmpdir(), "vp_prev_"));
    try {
      await writeFile(path.join(dir, "a.mp3"), mp3);
      await runFfmpeg(["-i", path.join(dir, "a.mp3"), "-af", chain.slice(1), path.join(dir, "b.mp3")], 30_000);
      return await readFile(path.join(dir, "b.mp3"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },

  async sanitize(plan: VideoPlan, userId: string): Promise<VideoPlan> {
    const videos = await myVideos(userId, null);
    // v0.9.71: 샤오홍슈만 (예전에 만든 AI 컷 계획이 들어와도 AI 컷은 쓰지 않는다)
    const sourceMode: VideoSourceMode = "xhs";
    const ok = new Set(videos.map((v) => v.id));
    const sfxNames = new Set(videoAssets.sfx().map(sfxName));
    const bgmNames = new Set(videoAssets.bgm().map(sfxName));
    const scenes = (Array.isArray(plan.scenes) ? plan.scenes : []).slice(0, VIDEO_RENDER_CONFIG.maxScenes).map((s, i) => ({
      index: i,
      narration: String(s.narration ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      // 효과음은 자료 폴더에 있는 이름만 (파일 이름에 공백·괄호가 있어도 그대로)
      sfx: typeof s.sfx === "string" && sfxNames.has(s.sfx) ? s.sfx : null,
      arrow: Boolean(s.arrow),
      attention: Boolean(s.attention),
      sourceVideoId: s.sourceVideoId && ok.has(String(s.sourceVideoId)) ? String(s.sourceVideoId) : null,
      pinned: Boolean(s.pinned),
    }));
    if (!scenes.some((s) => s.narration)) throw new AppError("VALIDATION", "컷이 없습니다. 컷 계획을 다시 만들어 주세요.");
    const sourceIds = (Array.isArray(plan.sourceVideoIds) ? plan.sourceVideoIds : []).map(String).filter((id) => ok.has(id));
    const pool = videos.filter((v) => sourceIds.includes(v.id));
    const placed = assignSources(scenes.filter((s) => s.narration), pool.length ? pool : videos.slice(0, 8), null);
    return {
      contentId: plan.contentId ? String(plan.contentId) : null,
      channelId: plan.channelId === "naver-clip" ? "naver-clip" : "youtube",
      selectedTitle: String(plan.selectedTitle ?? "").slice(0, 200),
      topLine1: String(plan.topLine1 ?? "").slice(0, 30),
      topLine2: String(plan.topLine2 ?? "").slice(0, 36),
      script: String(plan.script ?? "").slice(0, 4000),
      sourceMode,
      sourceVideoIds: sourceIds,
      scenes: placed,
      ending: plan.ending !== false,
      bgm: typeof plan.bgm === "string" && bgmNames.has(plan.bgm) ? plan.bgm : null,
      ...cleanVoice(plan.ttsEngine, plan.voice),
      ttsEmotion: cleanEmotion(plan.ttsEmotion),
      narrationOn: plan.narrationOn !== false,
      captions: plan.captions !== false,
      voiceStyle: VOICE_STYLES.some((v) => v.value === plan.voiceStyle) ? plan.voiceStyle : VOICE_STYLES[0].value,
      captionStyle: cleanCaptionStyle(plan.captionStyle),
      titleStyle: cleanTitleStyle(plan.titleStyle),
      voiceSpeed: cleanVoiceSpeed(plan.voiceSpeed),
      maxPauseSec: cleanPause(plan.maxPauseSec),
      targetSec: cleanTarget(plan.targetSec),
      meme: false,
    };
  },

  /** [영상 만들기] — 작업을 만들고, 렌더는 응답 뒤(after)에 같은 함수 안에서 */
  async create(input: { plan?: VideoPlan }): Promise<VideoJob> {
    const userId = await getCurrentUserId();
    if (!input.plan) throw new AppError("VALIDATION", "컷 계획이 없습니다.");
    const repo = getRepositories();
    await this.expire(userId);
    const actor = await getActorId();
    // 동시 1개는 사람마다 (관리자 공용 데이터에서도 서로 막지 않게, v0.9.68)
    const running = await repo.videoJobs.list((j) => j.userId === userId && IN_PROGRESS.includes(j.status) && (j.qa?.createdBy ?? j.userId) === (j.qa?.createdBy ? actor : userId));
    if (running.length) throw new AppError("BUSY", "이미 만들고 있는 영상이 있습니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const plan = await this.sanitize(input.plan, userId);
    if (!plan.scenes.some((s) => s.sourceVideoId)) throw new AppError("NO_SOURCE", "컷에 쓸 영상이 없습니다. 샤오홍슈 영상을 골라 주세요.", 400);
    const now = nowIso();
    const job: VideoJob = {
      id: createId("vj"),
      userId,
      contentId: plan.contentId,
      channelId: plan.channelId,
      sourceMode: plan.sourceMode,
      status: "queued",
      plan,
      qa: { issues: [], createdBy: actor },
      progress: 0,
      outputPath: null,
      error: null,
      claimedBy: "vercel",
      claimedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    return repo.videoJobs.insert(job);
  },

  /** 렌더 실행 (create 뒤 after() 에서). 실패해도 상태를 남긴다 */
  async run(jobId: string): Promise<void> {
    const repo = getRepositories();
    const job = await repo.videoJobs.get(jobId);
    if (!job) return;
    const set = (patch: Partial<VideoJob>) => repo.videoJobs.update(job.id, { ...patch, updatedAt: nowIso() });
    const started = Date.now();
    try {
      const videos = await myVideos(job.userId, null);
      const out = await renderVideo(job, videos, { stage: async (status, progress) => void (await set({ status, progress })) });
      const key = fileKey(job);
      await videoStorage.put(key, out.file);
      const problems = out.scenes.filter((s) => s.issue).length;
      const review = problems > 0 || (out.qa.blackFrames ?? 0) > 0 || out.qa.voice === "none";
      if (problems) out.qa.issues.unshift(`확인이 필요한 컷이 ${problems}개 있습니다 (원본 글자 처리).`);
      console.info("[VideoJob]", JSON.stringify({ jobId: job.id, scenes: out.scenes.length, aiCalls: out.aiCalls, ms: Date.now() - started, review }));
      await set({ status: review ? "needs_review" : "completed", progress: 100, outputPath: key, plan: { ...job.plan, scenes: out.scenes }, qa: { ...out.qa, aiCalls: out.aiCalls } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[VideoJob] failed", job.id, msg.slice(0, 400));
      await set({
        status: "failed",
        error: msg.includes("FFMPEG_MISSING") ? "영상 편집 엔진을 찾지 못했습니다. 관리자에게 알려 주세요." : msg.replace(/ffmpeg 실패[\s\S]*$/, "영상 편집 중 오류가 났습니다.").slice(0, 300),
      });
    }
  },

  async get(id: string): Promise<VideoJob & { fileUrl: string | null }> {
    const job = await ownJob(id);
    await this.expire(job.userId);
    const fresh = (await getRepositories().videoJobs.get(job.id)) ?? job;
    return { ...fresh, fileUrl: null };
  },

  async list(channelId: VideoChannel): Promise<VideoJob[]> {
    const userId = await getCurrentUserId();
    await this.expire(userId);
    await this.cleanup(userId);
    return (await getRepositories().videoJobs.list((j) => j.userId === userId && j.channelId === channelId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  },

  /** 미리보기 주소 (10분, 다운로드 표시 안 함) */
  async previewUrl(id: string): Promise<string | null> {
    const job = await ownJob(id);
    return job.outputPath && !job.qa.fileDeleted ? videoStorage.url(job.outputPath) : null;
  },

  /** 1회 다운로드: 주소를 주고 받은 시각을 남긴다 (1시간 뒤 삭제) */
  async downloadUrl(id: string): Promise<string> {
    const job = await ownJob(id);
    if (!job.outputPath || job.qa.fileDeleted) throw new AppError("GONE", "영상 파일이 이미 정리되었습니다 (1회 다운로드 후 1시간 또는 7일 보관). [다시 만들기]로 새로 만들 수 있습니다.", 410);
    const url = await videoStorage.url(job.outputPath);
    if (!url) throw new AppError("GONE", "영상 파일을 찾지 못했습니다.", 410);
    if (!job.qa.downloadedAt) await getRepositories().videoJobs.update(job.id, { qa: { ...job.qa, downloadedAt: nowIso() }, updatedAt: nowIso() });
    return url;
  },

  async approve(id: string): Promise<VideoJob> {
    const job = await ownJob(id);
    if (!["completed", "needs_review"].includes(job.status)) throw new AppError("VALIDATION", "완성된 영상만 승인할 수 있습니다.");
    return (await getRepositories().videoJobs.update(job.id, { status: "approved", updatedAt: nowIso() }))!;
  },

  /** 같은 계획(클립 교체 반영)으로 다시 렌더 — 컷 계획 AI 재호출 없음 */
  async rerender(id: string, plan?: VideoPlan): Promise<VideoJob> {
    const job = await ownJob(id);
    return this.create({ plan: plan ?? job.plan });
  },

  /** 멈춘 작업(10분 넘게 변화 없음)은 실패로 */
  async expire(userId: string): Promise<void> {
    const repo = getRepositories();
    const stuck = await repo.videoJobs.list((j) => j.userId === userId && IN_PROGRESS.includes(j.status) && Date.now() - Date.parse(j.updatedAt) > STALE_MS);
    for (const j of stuck) await repo.videoJobs.update(j.id, { status: "failed", error: "시간이 너무 오래 걸려 중단되었습니다. 컷 수를 줄이거나 다시 시도해 주세요.", updatedAt: nowIso() });
  },

  /** 보관 정리: 받은 뒤 1시간, 안 받아도 7일 */
  async cleanup(userId: string): Promise<void> {
    const repo = getRepositories();
    const old = await repo.videoJobs.list(
      (j) =>
        j.userId === userId &&
        Boolean(j.outputPath) &&
        !j.qa.fileDeleted &&
        ((j.qa.downloadedAt && Date.now() - Date.parse(j.qa.downloadedAt) > KEEP_AFTER_DOWNLOAD_MS) || Date.now() - Date.parse(j.createdAt) > KEEP_MS),
    );
    for (const j of old) {
      await videoStorage.remove(j.outputPath!).catch(() => undefined);
      await repo.videoJobs.update(j.id, { qa: { ...j.qa, fileDeleted: true }, updatedAt: nowIso() });
    }
    // v0.9.80: 저장해 둔 원본(다시 쓰기용)은 7일 뒤 지운다
    const kept = await videoStorage.list(`${userId}/src`).catch(() => []);
    for (const f of kept) {
      if (f.createdAt && Date.now() - Date.parse(f.createdAt) > VIDEO_RENDER_CONFIG.sourceCacheDays * 86_400_000) await videoStorage.remove(f.key).catch(() => undefined);
    }
  },
};
