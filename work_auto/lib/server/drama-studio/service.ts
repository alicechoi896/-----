import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppError } from "../http";
import { getCurrentUserId } from "../repositories";
import { mediaDuration } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import * as ai from "./ai";
import { renderDrama } from "./render";
import { faceCheck } from "./face";
import { isProjectId, loadProject, ownsKey, projectDir, readIndex, saveProject, withUrls } from "./store";
import { createImageTasks, createVideoTasks, syncTasks, type ImageJob, type VideoJob, createMusicTask } from "./tasks";
import { IMAGE_MODELS, VIDEO_MODELS, type VideoOptions } from "@/lib/drama-studio/models";
import {
  MAX_CHARACTERS,
  MAX_SCENES,
  SECTION_STEP,
  STEP_KEYS,
  STEPS,
  canEnter,
  chosenLogline,
  emptyProject,
  emptyScene,
  markDownstreamReview,
  markEdited,
  markNewResult,
  swapIntoTimeline,
  newId,
  passed,
  snapshotOf,
  startAt,
  stepIndex,
} from "@/lib/drama-studio/steps";
import type { DramaClip, DramaImage, DramaProject, DramaRender, DramaSettings, EditableSection, SheetKind, StepKey } from "@/lib/drama-studio/types";

/**
 * AI 드라마 스튜디오 서비스 (v0.9.81). docs/DRAMA_STUDIO.md
 * 모든 동작은 로그인한 사용자(관리자는 공용 데이터 주인)의 Storage 폴더 안에서만.
 */
const now = () => new Date().toISOString();
const EDITABLE: EditableSection[] = ["title", "currentStep", "settings", "ideas", "selection", "story", "characters", "sheets", "scenario", "storyboard", "clips", "timeline", "renderSettings"];
const MAX_JSON = 2_000_000;
const UPLOAD_RULES = {
  image: { exts: ["png", "jpg", "jpeg", "webp"], max: 15 * 1024 * 1024, type: (e: string) => (e === "png" ? "image/png" : e === "webp" ? "image/webp" : "image/jpeg") },
  video: { exts: ["mp4", "mov", "webm"], max: 45 * 1024 * 1024, type: (e: string) => (e === "mov" ? "video/quicktime" : e === "webm" ? "video/webm" : "video/mp4") },
  audio: { exts: ["mp3", "m4a", "wav"], max: 20 * 1024 * 1024, type: (e: string) => (e === "wav" ? "audio/wav" : e === "m4a" ? "audio/mp4" : "audio/mpeg") },
} as const;
type UploadKind = keyof typeof UPLOAD_RULES;

async function open(id: string): Promise<{ owner: string; p: DramaProject }> {
  const owner = await getCurrentUserId();
  return { owner, p: await loadProject(owner, String(id)) };
}

/** 서버가 오래 걸리는 일을 하는 동안 화면이 저장한 내용을 덮지 않게: 최신 문서를 다시 읽고 서버가 만든 것만 합친다 */
async function saveMerged(owner: string, worked: DramaProject, extra?: (fresh: DramaProject) => void): Promise<DramaProject> {
  const fresh = await loadProject(owner, worked.id);
  const byId = new Map(fresh.tasks.map((t) => [t.id, t]));
  for (const t of worked.tasks) byId.set(t.id, t);
  fresh.tasks = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-400);
  const union = (a: Record<string, DramaImage[]>, b: Record<string, DramaImage[]>) => {
    let added = false;
    for (const [k, list] of Object.entries(b)) {
      const have = new Set((a[k] ?? []).map((i) => i.id));
      for (const img of list) {
        if (have.has(img.id)) continue;
        (a[k] ??= []).push(img);
        added = true;
      }
    }
    return added;
  };
  if (union(fresh.sheets, worked.sheets)) markNewResult(fresh, "sheets");
  if (union(fresh.storyboard, worked.storyboard)) markNewResult(fresh, "storyboard");
  const haveClips = new Set(fresh.clips.map((c) => c.id));
  const newClips = worked.clips.filter((c) => !haveClips.has(c.id));
  if (newClips.length) {
    fresh.clips.push(...newClips);
    // 다시 만든 클립은 타임라인의 같은 장면 자리를 바꾼다 (최신 문서 기준으로)
    for (const c of newClips) swapIntoTimeline(fresh, c);
    markNewResult(fresh, "video");
  }
  // v0.9.101: 그 사이 만든 음악 곡 (작업 결과) 지키기
  const haveBgm = new Set((fresh.bgmTracks ?? []).map((x) => x.id));
  const newBgm = (worked.bgmTracks ?? []).filter((x) => !haveBgm.has(x.id));
  if (newBgm.length) {
    fresh.bgmTracks = [...(fresh.bgmTracks ?? []), ...newBgm];
    if (!fresh.renderSettings.bgmKey) fresh.renderSettings = { ...fresh.renderSettings, bgmKey: newBgm[0].key, bgmName: newBgm[0].name };
  }
  extra?.(fresh);
  return saveProject(owner, fresh, now());
}

/* ───── 화면 저장 (부분별) ───── */
function mergeImages(server: Record<string, DramaImage[]>, client: unknown, single: boolean): Record<string, DramaImage[]> {
  const c = (client && typeof client === "object" ? client : {}) as Record<string, Partial<DramaImage>[]>;
  const out: Record<string, DramaImage[]> = {};
  for (const [k, list] of Object.entries(server)) {
    const edits = new Map((Array.isArray(c[k]) ? c[k] : []).map((x) => [String(x.id), x]));
    // v0.9.89: 화면 목록에 없는 이미지(그 사이 교체·업로드·AI 결과)는 그대로 둔다. [목록에서 빼기] 표시(removed)한 것만 뺀다 (파일은 남김)
    const keep = list.filter((i) => !edits.get(i.id)?.removed);
    out[k] = keep.map((i) => {
      const e = edits.get(i.id);
      return e ? { ...i, approved: Boolean(e.approved), prompt: typeof e.prompt === "string" ? e.prompt.slice(0, 6000) : i.prompt } : i;
    });
    if (single) {
      // 스토리보드는 장면마다 승인 1장
      let seen = false;
      for (const i of [...out[k]].reverse()) {
        if (!i.approved) continue;
        if (seen) i.approved = false;
        else seen = true;
      }
    }
  }
  return out;
}

function mergeClips(p: DramaProject, client: unknown): DramaClip[] {
  const edits = new Map((Array.isArray(client) ? (client as Partial<DramaClip>[]) : []).map((x) => [String(x.id), x]));
  const sceneIds = new Set(p.scenario.scenes.map((s) => s.id));
  // v0.9.89: 화면 목록에 없는 클립은 그대로 (지우지 않음). v0.9.100: [지우기] 표시(removed)한 것만 뺀다 (파일은 남김)
  return p.clips.filter((c) => !edits.get(c.id)?.removed).map((c) => {
      const e = edits.get(c.id);
      if (!e) return c;
      const ids = Array.isArray(e.sceneIds) ? e.sceneIds.map(String).filter((x) => sceneIds.has(x)) : c.sceneIds;
      return { ...c, approved: Boolean(e.approved), sceneIds: ids };
    });
}

function cleanSection(p: DramaProject, section: EditableSection, value: unknown): void {
  const v = value as never;
  switch (section) {
    case "title":
      p.title = String(value ?? "").trim().slice(0, 80) || "제목 없는 드라마";
      return;
    case "currentStep":
      if (STEP_KEYS.includes(value as StepKey) && canEnter(p, value as StepKey)) p.currentStep = value as StepKey;
      return;
    case "settings": {
      const s = (value ?? {}) as Partial<DramaSettings>;
      p.settings = { ...p.settings, idea: String(s.idea ?? "").slice(0, 2000), genre: String(s.genre ?? p.settings.genre).slice(0, 20), mood: String(s.mood ?? p.settings.mood).slice(0, 20), targetSec: Math.min(600, Math.max(15, Number(s.targetSec) || 120)), aspect: s.aspect === "16:9" ? "16:9" : "9:16", audience: String(s.audience ?? "").slice(0, 200), mustHave: String(s.mustHave ?? "").slice(0, 500) };
      return;
    }
    case "ideas":
      p.ideas = (Array.isArray(value) ? value : []).slice(0, 80);
      return;
    case "selection":
      p.selection = v;
      return;
    case "story":
      p.story = v;
      return;
    case "characters": {
      const list = (Array.isArray(value) ? value : []).slice(0, MAX_CHARACTERS) as DramaProject["characters"];
      p.characters = list.map((c) => ({ ...c, id: /^c_[a-z0-9]{4,40}$/.test(String(c.id)) ? c.id : newId("c") }));
      return;
    }
    case "sheets":
      p.sheets = mergeImages(p.sheets, value, false);
      return;
    case "scenario": {
      const s = v as DramaProject["scenario"];
      // v0.9.97: 시나리오가 통째로 바뀐 뒤(장면 ID 가 새로) 예전 화면이 예전 장면으로 저장하면 거절 — 새 장면에 붙은 이미지·영상이 끊기지 않게
      if ((s?.rev ?? 0) !== (p.scenario.rev ?? 0)) throw new AppError("STALE_SCENARIO", "시나리오가 새로 바뀌었습니다. 화면을 새로고침(Ctrl+F5)한 뒤 다시 고쳐 주세요.", 409);
      const scenes = (Array.isArray(s?.scenes) ? s.scenes : []).slice(0, MAX_SCENES).map((x) => ({ ...emptyScene(), ...x, id: /^sc_[a-z0-9]{4,40}$/.test(String(x.id)) ? x.id : newId("sc") }));
      p.scenario = { ...p.scenario, ...s, scenes };
      return;
    }
    case "storyboard":
      p.storyboard = mergeImages(p.storyboard, value, true);
      return;
    case "clips":
      p.clips = mergeClips(p, value);
      return;
    case "timeline": {
      const ids = new Set(p.clips.map((c) => c.id));
      p.timeline = (Array.isArray(value) ? (value as DramaProject["timeline"]) : [])
        .filter((t) => ids.has(t.clipId))
        .slice(0, 120)
        .map((t) => ({ id: String(t.id || newId("tl")), clipId: t.clipId, trimStart: Math.max(0, Number(t.trimStart) || 0), trimEnd: Math.max(0, Number(t.trimEnd) || 0), audio: t.audio !== false, subtitle: typeof t.subtitle === "string" ? t.subtitle.slice(0, 1000) : null }));
      return;
    }
    case "renderSettings": {
      const r = (value ?? {}) as Partial<DramaProject["renderSettings"]>;
      p.renderSettings = { ...p.renderSettings, transition: r.transition === "fade" ? "fade" : "none", bgmVolume: Math.min(1, Math.max(0, Number(r.bgmVolume) || 0)), title: String(r.title ?? "").slice(0, 80), subtitles: r.subtitles === true, subtitleSize: r.subtitleSize === "s" || r.subtitleSize === "l" ? r.subtitleSize : "m", ...(r.bgmKey === null ? { bgmKey: null, bgmName: null } : {}), ...(r.logoKey === null ? { logoKey: null, logoName: null } : {}) };
      return;
    }
  }
}

function requireStep(p: DramaProject, step: StepKey) {
  if (!canEnter(p, step)) {
    const before = STEP_KEYS.slice(0, stepIndex(step)).find((k) => !passed(p.steps[k]));
    throw new AppError("STEP_LOCKED", `먼저 '${STEPS.find((s) => s.key === before)?.label}' 단계를 승인해 주세요.`, 409);
  }
}

/** 승인 조건 */
function approvalProblem(p: DramaProject, step: StepKey): string | null {
  switch (step) {
    case "ideas":
      return p.selection.ideaId || p.selection.idea ? null : "아이디어 카드 하나를 [선택]해 주세요.";
    case "select":
      return p.selection.idea?.title ? null : "제작할 아이디어 내용을 채워 주세요.";
    case "story":
      return chosenLogline(p.story).trim() ? null : "로그라인을 하나 고르거나 직접 써 주세요.";
    case "characters":
      return p.characters.length ? null : "등장인물을 1명 이상 만들어 주세요.";
    case "sheets": {
      const missing = p.characters.filter((c) => !(p.sheets[c.id] ?? []).some((i) => i.approved));
      return missing.length ? `기준 이미지를 고정하지 않은 인물: ${missing.map((c) => c.name).join(", ")}` : null;
    }
    case "scenario":
      return p.scenario.scenes.length ? null : "장면을 1개 이상 만들어 주세요.";
    case "storyboard": {
      const missing = p.scenario.scenes.map((s, i) => ((p.storyboard[s.id] ?? []).some((f) => f.approved) ? 0 : i + 1)).filter(Boolean);
      return missing.length ? `승인한 이미지가 없는 장면: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? " …" : ""}` : null;
    }
    case "video":
      return p.timeline.length ? null : "타임라인에 클립을 넣어 주세요.";
  }
}

export const dramaStudioService = {
  meta() {
    return { videoModels: VIDEO_MODELS, imageModels: IMAGE_MODELS };
  },

  async list() {
    const owner = await getCurrentUserId();
    return { projects: await readIndex(owner) };
  },

  async create(body: { title?: unknown; settings?: unknown; startStep?: unknown }) {
    const owner = await getCurrentUserId();
    const id = `dp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const p = emptyProject(id, String(body.title ?? "").trim().slice(0, 80) || "새 드라마", now());
    cleanSection(p, "settings", body.settings ?? {});
    const start = STEP_KEYS.includes(body.startStep as StepKey) ? (body.startStep as StepKey) : "ideas";
    if (start !== "ideas") startAt(p, start);
    await saveProject(owner, p, now());
    return withUrls(p);
  },

  async get(id: string) {
    const { owner, p } = await open(id);
    // 다시 들어오면 진행 중인 작업 상태부터 (무료)
    if (p.tasks.some((t) => t.status === "generating" || t.status === "requesting" || (t.status === "queued" && t.dependsOn))) {
      const changed = await syncTasks(owner, p).catch(() => false);
      if (changed) return withUrls(await saveMerged(owner, p));
    }
    // 렌더가 15분 넘게 '진행 중'이면 실패로 (서버가 멈춤)
    const stuck = p.renders.filter((r) => r.status === "running" && Date.now() - Date.parse(r.updatedAt) > 15 * 60_000);
    if (stuck.length) {
      for (const r of stuck) Object.assign(r, { status: "fail", error: "시간이 너무 오래 걸려 멈췄습니다. 다시 렌더해 주세요.", updatedAt: now() });
      return withUrls(await saveProject(owner, p, now()));
    }
    return withUrls(p);
  },

  /** 부분 저장 (자동 저장·수동 저장). 고친 단계는 '작업 중', 뒤 단계는 '재검토 필요' */
  async patch(id: string, body: { section?: unknown; value?: unknown }) {
    const section = String(body.section) as EditableSection;
    if (!EDITABLE.includes(section)) throw new AppError("VALIDATION", "저장할 수 없는 항목입니다.");
    if (JSON.stringify(body.value ?? null).length > MAX_JSON) throw new AppError("VALIDATION", "내용이 너무 큽니다.");
    const { owner, p } = await open(id);
    const before = JSON.stringify((p as unknown as Record<string, unknown>)[section]);
    cleanSection(p, section, body.value);
    const after = JSON.stringify((p as unknown as Record<string, unknown>)[section]);
    // v0.9.85: 저장 직전에 최신 문서를 다시 읽어 이 부분만 바꾼다 — 그 사이 끝난 승인·생성 결과(단계 상태)를 덮어쓰지 않게
    const fresh = await loadProject(owner, p.id);
    (fresh as unknown as Record<string, unknown>)[section] = (p as unknown as Record<string, unknown>)[section];
    if (section === "currentStep" && !canEnter(fresh, fresh.currentStep)) fresh.currentStep = p.currentStep;
    const step = SECTION_STEP[section];
    // v0.9.100: 인물의 '다른 호칭'만 바꾸면 뒤 단계 승인을 풀지 않는다 (얼굴·이야기는 그대로)
    const noAlias = (j: string) => (section === "characters" ? JSON.stringify((JSON.parse(j ?? "[]") as Record<string, unknown>[]).map((c) => ({ ...c, aliases: undefined }))) : j);
    if (step && before !== after && noAlias(before) !== noAlias(after)) markEdited(fresh, step);
    return withUrls(await saveProject(owner, fresh, now()));
  },

  async approve(id: string, body: { step?: unknown }) {
    const step = String(body.step) as StepKey;
    if (!STEP_KEYS.includes(step)) throw new AppError("VALIDATION", "단계를 알 수 없습니다.");
    const { owner, p } = await open(id);
    requireStep(p, step);
    const problem = approvalProblem(p, step);
    if (problem) throw new AppError("NOT_READY", problem, 409);
    const prev = p.steps[step];
    const at = now();
    p.steps[step] = { status: "approved", version: prev.version + 1, approvedAt: at };
    p.approvals = [...p.approvals, { step, version: prev.version + 1, at, snapshot: snapshotOf(p, step) }].slice(-80);
    // 다시 승인(바뀐 내용)이면 뒤 단계는 재검토
    if (prev.version > 0) markDownstreamReview(p, step);
    const next = STEP_KEYS[stepIndex(step) + 1];
    if (next) p.currentStep = next;
    if (step === "story" && p.story.workingTitle && p.title === "새 드라마") p.title = p.story.workingTitle;
    return withUrls(await saveProject(owner, p, at));
  },

  /** AI 글 생성 (버튼 1번 = AI 1~몇 회) */
  async generate(id: string, body: { action?: unknown; [k: string]: unknown }) {
    const { owner, p } = await open(id);
    const a = String(body.action);
    let aiCalls = 0;
    let extra: Record<string, unknown> = {};
    switch (a) {
      case "ideas": {
        const keep = p.ideas.filter((i) => i.favorite || i.id === p.selection.ideaId);
        const r = await ai.genIdeas(p, Math.max(1, 20 - keep.length), keep.map((i) => i.title));
        p.ideas = [...keep, ...r.ideas];
        aiCalls = r.aiCalls;
        markEdited(p, "ideas");
        break;
      }
      case "idea-one":
      case "similar": {
        const base = p.ideas.find((i) => i.id === body.ideaId);
        if (!base) throw new AppError("NOT_FOUND", "아이디어를 찾지 못했습니다.", 404);
        if (a === "similar") {
          const r = await ai.genSimilar(p, base, 5);
          p.ideas.splice(p.ideas.indexOf(base) + 1, 0, ...r.ideas);
          aiCalls = r.aiCalls;
        } else {
          const r = await ai.genIdeas(p, 1, p.ideas.map((i) => i.title));
          if (r.ideas[0]) p.ideas[p.ideas.indexOf(base)] = { ...r.ideas[0], id: base.id };
          aiCalls = r.aiCalls;
        }
        markEdited(p, "ideas");
        break;
      }
      case "improve": {
        requireStep(p, "select");
        const r = await ai.genImprove(p);
        p.selection.suggestions = r.suggestions;
        extra = { improved: r.improved };
        aiCalls = r.aiCalls;
        markEdited(p, "select");
        break;
      }
      case "story": {
        requireStep(p, "story");
        const r = await ai.genStory(p);
        p.story = r.story;
        aiCalls = r.aiCalls;
        markEdited(p, "story");
        break;
      }
      case "characters": {
        requireStep(p, "characters");
        const r = await ai.genCharacters(p);
        p.characters = r.characters;
        aiCalls = r.aiCalls;
        markEdited(p, "characters");
        break;
      }
      case "character-one": {
        requireStep(p, "characters");
        const c = p.characters.find((x) => x.id === body.charId);
        if (!c) throw new AppError("NOT_FOUND", "인물을 찾지 못했습니다.", 404);
        const r = await ai.genCharacterOne(p, c, String(body.note ?? "").slice(0, 300));
        p.characters[p.characters.indexOf(c)] = r.character;
        aiCalls = r.aiCalls;
        markEdited(p, "characters");
        break;
      }
      case "scenario": {
        requireStep(p, "scenario");
        if (!p.characters.length) throw new AppError("VALIDATION", "등장인물이 없습니다. 4단계에서 인물을 만들어 주세요.");
        const count = Math.min(MAX_SCENES, Math.max(3, Number(body.sceneCount) || p.scenario.sceneCount || 25));
        if (p.scenario.scenes.length) p.scenarioVersions = [...p.scenarioVersions, { id: newId("sv"), label: "다시 쓰기 전 자동 보관", at: now(), scenario: p.scenario }].slice(-10);
        const r = await ai.genScenario(p, count, body.style === "visual" ? "visual" : "dialogue", String(body.endingType ?? p.scenario.endingType).slice(0, 40));
        p.scenario = { ...r.scenario, rev: (p.scenario.rev ?? 0) + 1 };
        aiCalls = r.aiCalls;
        markEdited(p, "scenario");
        break;
      }
      case "scene-rewrite": {
        requireStep(p, "scenario");
        const r = await ai.genSceneRewrite(p, String(body.sceneId), String(body.note ?? "").slice(0, 300));
        const i = p.scenario.scenes.findIndex((s) => s.id === body.sceneId);
        p.scenario.scenes[i] = { ...r.scene, durationSec: p.scenario.scenes[i].durationSec };
        aiCalls = r.aiCalls;
        markEdited(p, "scenario");
        break;
      }
      case "parse-scenario": {
        requireStep(p, "scenario");
        const text = String(body.text ?? "").trim();
        if (text.length < 20) throw new AppError("VALIDATION", "시나리오 글을 붙여 넣어 주세요.");
        const r = await ai.genParseScenario(p, text);
        p.scenario = { ...p.scenario, title: r.title || p.scenario.title, scenes: r.scenes, sceneCount: r.scenes.length, rev: (p.scenario.rev ?? 0) + 1 };
        aiCalls = r.aiCalls;
        markEdited(p, "scenario");
        break;
      }
      case "en-prompts": {
        requireStep(p, "storyboard");
        const ids = Array.isArray(body.sceneIds) && body.sceneIds.length ? body.sceneIds.map(String) : p.scenario.scenes.map((s) => s.id);
        const r = await ai.genEnglishPrompts(p, ids);
        for (const s of p.scenario.scenes) if (r.prompts.has(s.id)) s.en = r.prompts.get(s.id)!;
        aiCalls = r.aiCalls;
        break;
      }
      // v0.9.89: '재검토 필요' 알림 닫기 — 확인만 하고 넘어갈 때 (이전에 승인했던 단계는 승인으로, 아니면 작업 중으로)
      case "ack-review": {
        const st = String(body.step) as StepKey;
        if (!STEP_KEYS.includes(st)) throw new AppError("VALIDATION", "단계를 알 수 없습니다.");
        const cur = p.steps[st];
        if (cur.status === "review") p.steps[st] = { ...cur, status: cur.version > 0 ? "approved" : "draft" };
        break;
      }
      // v0.9.93 얼굴 일관성 검사 (AI 이미지 읽기, 장면·클립 1개 = 1회)
      case "face-check": {
        requireStep(p, body.target === "clips" ? "video" : "storyboard");
        const r = await faceCheck(p, body.target === "clips" ? "clips" : "frames", Array.isArray(body.ids) ? body.ids.map(String) : undefined);
        aiCalls = r.aiCalls;
        extra = { faceChecked: r.checked, faceFlagged: r.flagged };
        break;
      }
      // v0.9.97: 지금 시나리오에 없는 장면에 붙은 스토리보드 이미지를 다른 장면으로 옮긴다 (이미 돈을 낸 이미지 되살리기)
      case "assign-frames": {
        const moves = (Array.isArray(body.moves) ? body.moves : []) as { imageId?: string; toSceneId?: string }[];
        const scenesNow = new Set(p.scenario.scenes.map((s) => s.id));
        let moved = 0;
        for (const m of moves.slice(0, 100)) {
          if (!m.toSceneId || !scenesNow.has(m.toSceneId)) continue;
          const from = Object.keys(p.storyboard).find((k) => (p.storyboard[k] ?? []).some((i) => i.id === m.imageId));
          if (!from || from === m.toSceneId) continue;
          const img = p.storyboard[from].find((i) => i.id === m.imageId)!;
          p.storyboard[from] = p.storyboard[from].filter((i) => i.id !== m.imageId);
          if (!p.storyboard[from].length) delete p.storyboard[from];
          const list = (p.storyboard[m.toSceneId] ??= []);
          const take = !list.some((i) => i.approved && !i.removed);
          list.push({ ...img, approved: take, version: list.length + 1, removed: false });
          moved++;
        }
        extra = { moved };
        if (moved) markEdited(p, "storyboard");
        break;
      }
      case "save-version": {
        p.scenarioVersions = [...p.scenarioVersions, { id: newId("sv"), label: String(body.label ?? "").slice(0, 40) || `버전 ${p.scenarioVersions.length + 1}`, at: now(), scenario: p.scenario }].slice(-10);
        break;
      }
      // v0.9.101: 배경음악 고르기·지우기 (무료)
      case "use-bgm": {
        const tr = (p.bgmTracks ?? []).find((x) => x.id === body.trackId);
        if (!tr) throw new AppError("NOT_FOUND", "음악을 찾지 못했습니다.", 404);
        p.renderSettings = { ...p.renderSettings, bgmKey: tr.key, bgmName: tr.name };
        break;
      }
      case "delete-bgm": {
        const tr = (p.bgmTracks ?? []).find((x) => x.id === body.trackId);
        if (!tr) throw new AppError("NOT_FOUND", "음악을 찾지 못했습니다.", 404);
        p.bgmTracks = (p.bgmTracks ?? []).filter((x) => x.id !== tr.id);
        if (p.renderSettings.bgmKey === tr.key) p.renderSettings = { ...p.renderSettings, bgmKey: null, bgmName: null };
        await videoStorage.remove(tr.key).catch(() => undefined);
        break;
      }
      // v0.9.101: 렌더링(최종 영상) 지우기 — 병합 중인 것은 빼고, 파일도 지운다 (다시 렌더링하면 또 만들 수 있음)
      case "delete-render": {
        const ids = body.all === true ? p.renders.map((r) => r.id) : [String(body.renderId ?? "")];
        const gone = p.renders.filter((r) => ids.includes(r.id) && r.status !== "running");
        if (!gone.length) throw new AppError("VALIDATION", "지울 렌더링 영상이 없습니다 (병합 중인 것은 지울 수 없습니다).");
        p.renders = p.renders.filter((r) => !gone.includes(r));
        for (const r of gone) if (r.key) await videoStorage.remove(r.key).catch(() => undefined);
        extra = { deleted: gone.length };
        break;
      }
      case "restore-version": {
        const v = p.scenarioVersions.find((x) => x.id === body.versionId);
        if (!v) throw new AppError("NOT_FOUND", "버전을 찾지 못했습니다.", 404);
        p.scenario = { ...v.scenario, rev: (p.scenario.rev ?? 0) + 1 };
        markEdited(p, "scenario");
        break;
      }
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
    console.info("[DramaStudio] generate", JSON.stringify({ project: p.id, action: a, aiCalls, clientRequestId: String(body.clientRequestId ?? "-").slice(0, 40) }));
    const saved = await saveProject(owner, p, now());
    return { ...(await withUrls(saved)), aiCalls, ...extra };
  },

  /** 이미지 만들기 (Kie, 1장 = 1회 과금) — 화면에서 장수·최소 예상 크레딧을 확인받은 뒤에만 */
  async images(id: string, body: { jobs?: unknown; modelId?: unknown; clientRequestId?: unknown; confirmed?: unknown }) {
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [만들기]를 눌러 주세요.", 409);
    const requestId = String(body.clientRequestId ?? "").slice(0, 80);
    if (requestId.length < 8) throw new AppError("VALIDATION", "요청 번호가 없습니다.");
    const { owner, p } = await open(id);
    const jobs = (Array.isArray(body.jobs) ? body.jobs : []) as ImageJob[];
    requireStep(p, jobs.some((j) => j?.target?.type === "frame") ? "storyboard" : "sheets");
    const tasks = await createImageTasks(owner, p, jobs, String(body.modelId ?? "nano-banana-edit"), requestId);
    const saved = await saveMerged(owner, { ...p, tasks: [...p.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks] });
    return { ...(await withUrls(saved)), created: tasks.filter((t) => t.externalTaskId).length, failed: tasks.filter((t) => t.status === "fail").length };
  },

  /** v0.9.101 배경음악 만들기 (Kie Suno, 버튼 1번 = 1회 과금, 곡 2개 정도) */
  async music(id: string, body: { note?: unknown; clientRequestId?: unknown; confirmed?: unknown }) {
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [만들기]를 눌러 주세요.", 409);
    const requestId = String(body.clientRequestId ?? "").slice(0, 80);
    if (requestId.length < 8) throw new AppError("VALIDATION", "요청 번호가 없습니다.");
    const { owner, p } = await open(id);
    requireStep(p, "video");
    if (p.tasks.some((t) => t.kind === "music" && (t.status === "generating" || t.status === "requesting") && t.requestId !== requestId)) throw new AppError("BUSY", "음악을 만드는 중입니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const tasks = await createMusicTask(p, String(body.note ?? "").slice(0, 300), requestId);
    const saved = await saveMerged(owner, { ...p, tasks: [...p.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks] });
    return { ...(await withUrls(saved)), created: tasks.filter((t) => t.externalTaskId).length, failed: tasks.filter((t) => t.status === "fail").length };
  },

  /** 영상 만들기 (Kie, 작업 1개 = 1회 과금) */
  async videos(id: string, body: { jobs?: unknown; clientRequestId?: unknown; confirmed?: unknown; retryTaskIds?: unknown; chain?: unknown }) {
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [만들기]를 눌러 주세요.", 409);
    const requestId = String(body.clientRequestId ?? "").slice(0, 80);
    if (requestId.length < 8) throw new AppError("VALIDATION", "요청 번호가 없습니다.");
    const { owner, p } = await open(id);
    requireStep(p, "video");
    let jobs = (Array.isArray(body.jobs) ? body.jobs : []) as VideoJob[];
    // 실패한 작업만 다시: 같은 장면·설정·프롬프트로 새 작업
    if (Array.isArray(body.retryTaskIds) && body.retryTaskIds.length) {
      jobs = p.tasks
        .filter((t) => (body.retryTaskIds as unknown[]).includes(t.id) && t.kind === "video" && t.status === "fail")
        .map((t) => ({ sceneIds: (t.target as { sceneIds: string[] }).sceneIds, options: (t.request as { options: VideoOptions }).options, prompt: t.prompt, lastSceneId: (t.request as { lastSceneId?: string }).lastSceneId ?? undefined }));
      if (!jobs.length) throw new AppError("VALIDATION", "다시 만들 실패 작업이 없습니다.");
    }
    const tasks = await createVideoTasks(owner, p, jobs, requestId, body.chain === true);
    const saved = await saveMerged(owner, { ...p, tasks: [...p.tasks.filter((t) => !tasks.some((x) => x.id === t.id)), ...tasks] });
    return { ...(await withUrls(saved)), created: tasks.filter((t) => t.externalTaskId).length, failed: tasks.filter((t) => t.status === "fail").length };
  },

  /** 진행 중 작업 상태 확인 (무료) */
  async sync(id: string) {
    const { owner, p } = await open(id);
    const changed = await syncTasks(owner, p);
    return { ...(await withUrls(changed ? await saveMerged(owner, p) : p)), changed };
  },

  /** 직접 올리기 1) 올릴 주소 (브라우저가 Storage 에 바로 올린다) */
  async uploadUrl(id: string, body: { kind?: unknown; fileName?: unknown; size?: unknown }) {
    const kind = String(body.kind) as UploadKind;
    const rule = UPLOAD_RULES[kind];
    if (!rule) throw new AppError("VALIDATION", "올릴 수 없는 파일 종류입니다.");
    const ext = String(body.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (!(rule.exts as readonly string[]).includes(ext)) throw new AppError("VALIDATION", `${rule.exts.join("·")} 파일만 올릴 수 있습니다.`);
    if (Number(body.size) > rule.max) throw new AppError("VALIDATION", `파일이 너무 큽니다 (최대 ${Math.round(rule.max / 1048576)}MB).`);
    const owner = await getCurrentUserId();
    if (!isProjectId(String(id))) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다.", 404);
    const key = `${projectDir(owner, String(id))}/up/${newId(kind[0])}.${ext === "jpeg" ? "jpg" : ext}`;
    const up = await videoStorage.signedUpload(key, "/api/drama-studio/upload");
    return { key, ...up, contentType: rule.type(ext) };
  },

  /** 직접 올리기 2) 올린 파일을 단계에 잇기 */
  async register(id: string, body: { key?: unknown; kind?: unknown; fileName?: unknown; target?: unknown }) {
    const { owner, p } = await open(id);
    const key = String(body.key ?? "");
    if (!ownsKey(owner, p.id, key)) throw new AppError("VALIDATION", "이 프로젝트에 올린 파일이 아닙니다.");
    const buf = await videoStorage.download(key);
    if (!buf) throw new AppError("NOT_FOUND", "올린 파일을 찾지 못했습니다. 다시 올려 주세요.", 404);
    const fileName = String(body.fileName ?? "").slice(0, 120);
    const target = (body.target ?? {}) as { type?: string; charId?: string; sheetKind?: SheetKind; sceneId?: string; sceneIds?: string[]; newSceneTitle?: string };
    const at = now();
    const img = (over: Partial<DramaImage>): DramaImage => ({ id: newId("im"), key, prompt: "", modelId: "upload", source: "upload", createdAt: at, version: 1, approved: false, fileName, ...over });
    if (target.type === "sheet") {
      const c = p.characters.find((x) => x.id === target.charId);
      if (!c) throw new AppError("VALIDATION", "인물을 찾지 못했습니다.");
      const kind: SheetKind = ["front", "side", "full", "expression", "outfit", "extra"].includes(String(target.sheetKind)) ? (target.sheetKind as SheetKind) : "extra";
      (p.sheets[c.id] ??= []).push(img({ kind, version: (p.sheets[c.id] ?? []).filter((i) => i.kind === kind).length + 1 }));
      markEdited(p, "sheets");
    } else if (target.type === "frame") {
      let sceneId = target.sceneId;
      // 스토리보드부터 시작: 장면이 없으면 파일마다 장면을 만든다
      if (!sceneId) {
        const scene = emptyScene({ title: String(target.newSceneTitle ?? fileName.replace(/\.[^.]+$/, "")).slice(0, 80) });
        p.scenario.scenes.push(scene);
        sceneId = scene.id;
        markEdited(p, "scenario");
      }
      if (!p.scenario.scenes.some((s) => s.id === sceneId)) throw new AppError("VALIDATION", "장면을 찾지 못했습니다.");
      const list = (p.storyboard[sceneId] ??= []);
      for (const f of list) f.approved = false;
      list.push(img({ version: list.length + 1, approved: true }));
      markEdited(p, "storyboard");
    } else if (target.type === "clip") {
      const dir = await mkdtemp(path.join(os.tmpdir(), "ds_up_"));
      let dur = 0;
      try {
        const f = path.join(dir, "c.mp4");
        await writeFile(f, buf);
        dur = await mediaDuration(f);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      if (dur < 0.3) throw new AppError("VALIDATION", "영상 길이를 읽지 못했습니다.");
      const sceneIds = (Array.isArray(target.sceneIds) ? target.sceneIds : []).map(String).filter((x) => p.scenario.scenes.some((s) => s.id === x));
      const clip: DramaClip = { id: newId("cl"), sceneIds, key, source: "upload", modelId: "upload", mode: "upload", prompt: "", durationSec: Number(dur.toFixed(2)), createdAt: at, approved: true, taskId: null, fileName };
      p.clips.push(clip);
      swapIntoTimeline(p, clip);
      markEdited(p, "video");
    } else if (target.type === "bgm") {
      p.renderSettings = { ...p.renderSettings, bgmKey: key, bgmName: fileName };
      (p.bgmTracks ??= []).push({ id: newId("bg"), key, name: fileName.slice(0, 60) || "올린 음악", durationSec: null, prompt: "", source: "upload", createdAt: at });
    } else if (target.type === "logo") {
      p.renderSettings = { ...p.renderSettings, logoKey: key, logoName: fileName };
    } else throw new AppError("VALIDATION", "어디에 쓸 파일인지 알 수 없습니다.");
    return withUrls(await saveProject(owner, p, at));
  },

  /** 데모(Supabase 없음)에서만: 서버 메모리에 올리기 */
  async uploadMemory(key: string, body: ArrayBuffer) {
    const owner = await getCurrentUserId();
    if (!key.startsWith(`${owner}/drama/`) || key.includes("..")) throw new AppError("VALIDATION", "잘못된 주소입니다.");
    await videoStorage.put(key, Buffer.from(body));
  },

  /** 최종 병합 시작 (응답 뒤에 같은 함수 안에서 렌더) */
  async startRender(id: string): Promise<{ result: Awaited<ReturnType<typeof withUrls>>; run: () => Promise<void> }> {
    const { owner, p } = await open(id);
    requireStep(p, "video");
    if (p.renders.some((r) => r.status === "running")) throw new AppError("BUSY", "이미 렌더하고 있습니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const items = p.timeline.filter((t) => p.clips.find((c) => c.id === t.clipId)?.approved);
    if (!items.length) throw new AppError("VALIDATION", "타임라인에 승인한 클립을 넣어 주세요.");
    const at = now();
    const r: DramaRender = { id: newId("rd"), version: (p.renders.at(-1)?.version ?? 0) + 1, status: "running", totalSec: null, key: null, error: null, createdAt: at, updatedAt: at };
    p.renders = [...p.renders, r].slice(-20);
    const saved = await saveProject(owner, p, at);
    const run = async () => {
      const t0 = Date.now();
      try {
        const out = await renderDrama(owner, saved, r);
        await saveMerged(owner, saved, (fresh) => {
          const x = fresh.renders.find((y) => y.id === r.id);
          if (x) Object.assign(x, { status: "success", key: out.key, totalSec: out.totalSec, updatedAt: now() });
        });
        console.info("[DramaRender]", JSON.stringify({ project: p.id, render: r.id, clips: items.length, sec: out.totalSec, ms: Date.now() - t0 }));
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "렌더하지 못했습니다.";
        console.error("[DramaRender] fail", JSON.stringify({ project: p.id, render: r.id, error: msg }));
        await saveMerged(owner, saved, (fresh) => {
          const x = fresh.renders.find((y) => y.id === r.id);
          if (x) Object.assign(x, { status: "fail", error: msg, updatedAt: now() });
        }).catch(() => undefined);
      }
    };
    return { result: await withUrls(saved), run };
  },

  /** 내보내기: 로그라인·인물·시나리오·프롬프트 (Markdown) + 파일 목록 */
  async exportText(id: string): Promise<string> {
    const { p } = await open(id);
    const name = (cid: string) => p.characters.find((c) => c.id === cid)?.name ?? cid;
    const lines = [
      `# ${p.title}`,
      "",
      `- 장르 ${p.settings.genre} · 분위기 ${p.settings.mood} · 목표 ${p.settings.targetSec}초 · ${p.settings.aspect}`,
      "",
      "## 로그라인·주제",
      `- 가제: ${p.story.workingTitle}`,
      `- 로그라인: ${chosenLogline(p.story)}`,
      `- 주제: ${p.story.theme}`,
      `- 목표/결핍: ${p.story.goal} / ${p.story.lack}`,
      `- 갈등: ${p.story.conflict}`,
      `- 반전: ${p.story.twist}`,
      `- 결말: ${p.story.ending}`,
      `- 메시지: ${p.story.message}`,
      `- 3초 후킹: ${p.story.hookStrategy}`,
      "",
      "## 등장인물",
      ...p.characters.flatMap((c) => [`### ${c.name} (${c.role}, ${c.age}, ${c.gender}) — ID ${c.id}`, `- 외모: ${c.appearance}`, `- 외모(영문): ${c.appearanceEn}`, `- 의상: ${c.outfit}`, `- 성격: ${c.personality}`, `- 욕망: ${c.desire} / 약점: ${c.weakness} / 비밀: ${c.secret}`, `- 관계: ${c.relations.map((r) => `${name(r.targetId)} — ${r.relation}`).join(", ")}`, `- 변화: ${c.arc} / 말투: ${c.speech}`, ""]),
      "## 시나리오",
      `**${p.scenario.title}**`,
      "",
      p.scenario.synopsis,
      "",
      ...p.scenario.scenes.flatMap((s, i) => [
        `### ${i + 1}. ${s.title} (${s.location} · ${s.timeOfDay} · ${s.durationSec}초)`,
        `- 인물: ${s.characterIds.map(name).join(", ")}`,
        `- 행동: ${s.action}`,
        `- 대사:\n${s.dialogue.split("\n").map((l) => `  > ${l}`).join("\n")}`,
        `- 감정: ${s.emotion} · 카메라: ${s.camera} · 소리: ${s.sound}`,
        `- 화면: ${s.visual}`,
        s.imagePrompt ? `- 이미지 프롬프트: ${s.imagePrompt}` : "",
        s.videoPrompt ? `- 영상 프롬프트: ${s.videoPrompt}` : "",
        s.en ? `- 영어 조각: ${Object.values(s.en).map((x) => (Array.isArray(x) ? x.map((b) => `${b.name}: ${b.position}, ${b.pose}, ${b.cue}`).join("; ") : x)).filter(Boolean).join(" | ")}` : "",
        "",
      ]),
      "## 생성 작업 프롬프트",
      ...p.tasks.map((t) => `- [${t.kind} · ${t.modelId} · ${t.status}] ${t.prompt.replace(/\n/g, " ").slice(0, 600)}`),
    ];
    return lines.filter((l) => l !== "").join("\n").replace(/\n(#+ )/g, "\n\n$1");
  },
};
