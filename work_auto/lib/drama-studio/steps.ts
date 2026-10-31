import type { DramaProject, DramaScenario, DramaScene, DramaSettings, DramaStory, EditableSection, StepKey, StepState, TimelineItem } from "./types";

/**
 * 8단계 순서·승인 규칙 (화면·서버 공용). docs/DRAMA_STUDIO.md
 * - 승인하지 않은 단계는 건너뛰지 않는다: 다음 단계는 앞 단계가 승인(또는 '중간부터 시작'으로 건너뜀)일 때만 연다
 * - 승인한 단계를 고치면 그 단계는 '작업 중'으로 돌아가고, 뒤에서 이미 승인·작업한 단계는 지우지 않고 '재검토 필요'로 표시한다
 */
export const STEPS: { key: StepKey; no: string; label: string; desc: string }[] = [
  { key: "ideas", no: "01", label: "아이디어", desc: "아이디어 20개" },
  { key: "select", no: "02", label: "선택", desc: "제작 방향 확정" },
  { key: "story", no: "03", label: "로그라인", desc: "로그라인·주제" },
  { key: "characters", no: "04", label: "등장인물", desc: "인물·관계" },
  { key: "sheets", no: "05", label: "캐릭터 시트", desc: "기준 이미지" },
  { key: "scenario", no: "06", label: "시나리오", desc: "장면별 대본" },
  { key: "storyboard", no: "07", label: "스토리보드", desc: "장면 이미지" },
  { key: "video", no: "08", label: "영상 제작", desc: "생성·편집·병합" },
];
export const STEP_KEYS = STEPS.map((s) => s.key);
export const stepIndex = (k: StepKey) => STEP_KEYS.indexOf(k);
export const STEP_STATUS_LABEL: Record<StepState["status"], string> = { empty: "시작 전", draft: "작업 중", approved: "승인", review: "재검토 필요", skipped: "건너뜀" };

/** 어떤 부분을 고치면 어느 단계가 바뀐 것인가 */
export const SECTION_STEP: Partial<Record<EditableSection, StepKey>> = {
  settings: "ideas",
  ideas: "ideas",
  selection: "select",
  story: "story",
  characters: "characters",
  sheets: "sheets",
  scenario: "scenario",
  storyboard: "storyboard",
  clips: "video",
  timeline: "video",
  renderSettings: "video",
  shots: "video",
};

export const GENRES = ["로맨스", "복수", "판타지", "사극", "스릴러", "코미디", "미스터리", "가족", "기타"] as const;
export const MOODS = ["감동", "긴장", "반전", "통쾌함", "코믹", "설렘", "미스터리"] as const;
export const TARGET_SECONDS = [60, 90, 120, 180] as const;
export const DEFAULT_SCENE_COUNT = 25;
/** v0.9.93: 기본 장면 수 = 전체 길이 ÷ 8초 (한 장면에 행동 하나를 끝까지 담을 수 있게, 6~25) */
export const defaultSceneCount = (targetSec: number) => Math.min(25, Math.max(6, Math.round((targetSec || 120) / 8)));
export const MAX_SCENES = 60;
export const MAX_CHARACTERS = 12;

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const emptyStory = (): DramaStory => ({
  workingTitle: "",
  loglines: [],
  loglineIndex: 0,
  customLogline: "",
  theme: "",
  goal: "",
  lack: "",
  conflict: "",
  twist: "",
  ending: "",
  message: "",
  hookStrategy: "",
});

export const emptyScenario = (): DramaScenario => ({
  title: "",
  synopsis: "",
  acts: { setup: "", development: "", crisis: "", climax: "", ending: "" },
  twist: "",
  sceneCount: DEFAULT_SCENE_COUNT,
  style: "dialogue",
  endingType: "반전 결말",
  scenes: [],
});

export const emptyScene = (over: Partial<DramaScene> = {}): DramaScene => ({
  id: newId("sc"),
  title: "",
  location: "",
  timeOfDay: "",
  characterIds: [],
  action: "",
  dialogue: "",
  emotion: "",
  camera: "",
  visual: "",
  durationSec: 5,
  sound: "",
  continuity: "",
  en: null,
  imagePrompt: "",
  videoPrompt: "",
  ...over,
});

export const DEFAULT_SETTINGS: DramaSettings = { idea: "", genre: "로맨스", mood: "반전", targetSec: 120, aspect: "9:16", audience: "", mustHave: "" };

/** v0.9.101: 배경음악은 대사 밑에 아주 작게 (대사가 나오면 더 줄어든다) */
export const BGM_DEFAULT_VOLUME = 0.08;

export function emptyProject(id: string, title: string, now: string, settings: Partial<DramaSettings> = {}): DramaProject {
  const steps = Object.fromEntries(STEP_KEYS.map((k) => [k, { status: "empty", version: 0, approvedAt: null } satisfies StepState])) as Record<StepKey, StepState>;
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    rev: 0,
    currentStep: "ideas",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    steps,
    approvals: [],
    ideas: [],
    selection: { ideaId: null, idea: null, memo: "", suggestions: [] },
    story: emptyStory(),
    characters: [],
    sheets: {},
    scenario: { ...emptyScenario(), sceneCount: defaultSceneCount(settings.targetSec ?? DEFAULT_SETTINGS.targetSec) },
    scenarioVersions: [],
    storyboard: {},
    tasks: [],
    clips: [],
    timeline: [],
    renderSettings: { transition: "none", bgmKey: null, bgmName: null, bgmVolume: BGM_DEFAULT_VOLUME, title: title },
    renders: [],
  };
}

/** 중간부터 시작: 앞 단계는 '건너뜀' */
export function startAt(p: DramaProject, step: StepKey): DramaProject {
  const i = stepIndex(step);
  for (const k of STEP_KEYS.slice(0, i)) p.steps[k] = { ...p.steps[k], status: "skipped" };
  p.currentStep = step;
  return p;
}

/** 앞 단계로 인정: 승인·건너뜀·재검토, 또는 한 번 승인한 뒤 고치는 중 (고쳤다고 뒤 단계를 잠그지 않는다) */
export const passed = (s: StepState) => ["approved", "skipped", "review"].includes(s.status) || (s.status === "draft" && s.version > 0);

/** 이 단계에 들어갈 수 있나 (앞 단계가 모두 승인·건너뜀) */
export function canEnter(p: DramaProject, step: StepKey): boolean {
  return STEP_KEYS.slice(0, stepIndex(step)).every((k) => passed(p.steps[k]));
}

/** 단계 내용을 고쳤을 때: 승인돼 있었다면 '작업 중'으로, 뒤 단계 중 진행된 것은 '재검토 필요' */
export function markEdited(p: DramaProject, step: StepKey): void {
  const s = p.steps[step];
  const wasApproved = s.status === "approved";
  // 건너뛴 단계(중간부터 시작)는 내용을 채워도 '건너뜀' 그대로 — 뒤 단계를 잠그지 않게 (v0.9.87)
  if (s.status === "empty" || wasApproved) p.steps[step] = { ...s, status: "draft" };
  if (wasApproved) markDownstreamReview(p, step);
}

export function markDownstreamReview(p: DramaProject, step: StepKey): void {
  for (const k of STEP_KEYS.slice(stepIndex(step) + 1)) {
    if (p.steps[k].status === "approved" || p.steps[k].status === "draft") p.steps[k] = { ...p.steps[k], status: "review" };
  }
}

/** 진행률 (화면 상단) */
export function progressOf(p: DramaProject): { approved: number; total: number; storyboard: { done: number; total: number }; clips: { done: number; total: number } } {
  const scenes = p.scenario.scenes;
  const framed = scenes.filter((s) => (p.storyboard[s.id] ?? []).some((f) => f.approved)).length;
  const covered = new Set(p.clips.filter((c) => c.approved).flatMap((c) => c.sceneIds));
  return {
    approved: STEP_KEYS.filter((k) => p.steps[k].status === "approved").length,
    total: STEP_KEYS.length,
    storyboard: { done: framed, total: scenes.length },
    clips: { done: scenes.filter((s) => covered.has(s.id)).length, total: scenes.length },
  };
}

/** 승인 기록에 남길 내용 (글 단계만, 파일은 키만) */
export function snapshotOf(p: DramaProject, step: StepKey): unknown {
  switch (step) {
    case "ideas":
      return { settings: p.settings, ideas: p.ideas };
    case "select":
      return p.selection;
    case "story":
      return p.story;
    case "characters":
      return p.characters;
    case "sheets":
      return Object.fromEntries(Object.entries(p.sheets).map(([c, list]) => [c, list.filter((i) => i.approved).map((i) => ({ kind: i.kind, key: i.key, version: i.version }))]));
    case "scenario":
      return p.scenario;
    case "storyboard":
      return Object.fromEntries(Object.entries(p.storyboard).map(([s, list]) => [s, list.filter((i) => i.approved).map((i) => ({ key: i.key, version: i.version }))]));
    case "video":
      return { timeline: p.timeline };
  }
}

/** 승인된 로그라인 */
export function chosenLogline(s: DramaStory): string {
  return s.loglineIndex >= 0 ? (s.loglines[s.loglineIndex] ?? s.customLogline) : s.customLogline;
}

/** 장면 번호 (순서대로 1부터) */
export const sceneNo = (p: DramaProject, sceneId: string) => p.scenario.scenes.findIndex((s) => s.id === sceneId) + 1;

/**
 * v0.9.88: 새 결과(AI 이미지·클립)가 들어왔을 때 — 아직 시작 전이면 '작업 중'으로만. 승인한 단계는 그대로 둔다
 * (새 이미지가 오는 것만으로는 고정·승인한 내용이 바뀌지 않으므로 승인을 풀거나 뒤 단계를 '재검토'로 만들지 않는다)
 */
export function markNewResult(p: DramaProject, step: StepKey): void {
  if (p.steps[step].status === "empty") p.steps[step] = { ...p.steps[step], status: "draft" };
}

/**
 * v0.9.90: 새 클립(다시 생성·파일 올리기)이 타임라인에 있는 클립과 같은 장면이면 그 자리를 새 클립으로 바꾸고 승인한다.
 * 예전 클립은 클립 목록에 남아 [이 버전으로 교체]로 되돌릴 수 있다. 바꿨으면 true
 */
export function swapIntoTimeline(p: DramaProject, clip: { id: string; sceneIds: string[]; shotId?: string | null }): boolean {
  if (!clip.sceneIds.length) return false;
  const same = (ids: string[]) => ids.length === clip.sceneIds.length && ids.every((x) => clip.sceneIds.includes(x));
  // v0.9.104: 샷 클립은 같은 샷끼리만 바꾼다 (같은 장면의 다른 샷·장면 클립과 섞지 않음)
  const sameSlot = (old: { sceneIds: string[]; shotId?: string | null }) => (clip.shotId ? old.shotId === clip.shotId : !old.shotId && same(old.sceneIds));
  let swapped = false;
  const olds = new Set<string>();
  p.timeline = p.timeline.map((t) => {
    const old = p.clips.find((c) => c.id === t.clipId);
    if (!old || old.id === clip.id || !sameSlot(old)) return t;
    swapped = true;
    olds.add(old.id);
    return { ...t, clipId: clip.id, trimStart: 0, trimEnd: 0 };
  });
  // v0.9.94: 바꾼 예전 클립은 승인을 풀어 '모두 승인 + 타임라인'에서 다시 끝에 붙지 않게
  if (swapped) p.clips = p.clips.map((c) => (c.id === clip.id ? { ...c, approved: true } : olds.has(c.id) ? { ...c, approved: false } : c));
  return swapped;
}

/** v0.9.104: 클립 자막 자동 — 샷 클립은 그 샷 대사, 아니면 장면 대사 */
export function clipSubtitle(p: DramaProject, clip: { sceneIds: string[]; shotId?: string | null }): string {
  const shot = clip.shotId ? (p.shots ?? []).find((s) => s.id === clip.shotId) : null;
  if (!shot) return autoSubtitle(p, clip.sceneIds);
  return shot.dialogue
    .split(/\n+/)
    .map((l) => l.replace(/^[^:：]{1,12}[:：]\s*/, "").replace(/^["'“”]|["'“”]$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** v0.9.92: 클립 자막 자동 — 클립 장면들의 대사에서 말한 사람 이름('이름:')을 뺀 줄 */
export function autoSubtitle(p: DramaProject, sceneIds: string[]): string {
  return sceneIds
    .map((id) => p.scenario.scenes.find((s) => s.id === id)?.dialogue ?? "")
    .join("\n")
    .split(/\n+/)
    .map((l) => l.replace(/^[^:：]{1,12}[:：]\s*/, "").replace(/^["'“”]|["'“”]$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * v0.9.94: 장면 길이 합을 목표 길이에 맞춘다 (비율대로 늘리고 줄인 뒤 4~15초 안에서 남는 초를 나눔).
 * 3분을 골랐는데 장면 길이 합이 2분 27초라 3분이 안 나오던 문제
 */
export function fitDurations<T extends { durationSec: number }>(scenes: T[], targetSec: number, min = 4, max = 15): T[] {
  if (!scenes.length || !targetSec) return scenes;
  const sum = scenes.reduce((n, s) => n + Math.max(1, s.durationSec || 8), 0);
  const out = scenes.map((s) => ({ ...s, durationSec: Math.min(max, Math.max(min, Math.round((Math.max(1, s.durationSec || 8) * targetSec) / sum))) }));
  // 반올림·상한 때문에 남거나 모자란 초를 앞에서부터 1초씩
  let diff = targetSec - out.reduce((n, s) => n + s.durationSec, 0);
  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    const i = guard % out.length;
    if (diff > 0 && out[i].durationSec < max) {
      out[i].durationSec++;
      diff--;
    } else if (diff < 0 && out[i].durationSec > min) {
      out[i].durationSec--;
      diff++;
    }
  }
  return out;
}

/**
 * v0.9.94: 타임라인을 장면 순서대로, 장면마다 클립 1개로 다시 정리한다 (승인한 클립만).
 * 이미 타임라인에 있던 클립(다듬기·소리 설정)은 그대로 쓰고, 없으면 그 장면의 가장 최근 승인 클립. 장면 없는 업로드 클립은 맨 뒤에 그대로.
 * '모두 승인 + 타임라인'이 예전 버전까지 끝에 또 붙이던 문제
 */
export function buildTimeline(p: DramaProject): TimelineItem[] {
  const covered = new Set<string>();
  const inTl = new Map(p.timeline.map((t) => [t.clipId, t]));
  const out: TimelineItem[] = [];
  for (const s of p.scenario.scenes) {
    if (covered.has(s.id)) continue;
    // v0.9.104: 샷으로 나눠 만든 장면은 샷 순서대로 샷마다 1개
    const shots = (p.shots ?? []).filter((x) => x.sceneId === s.id).sort((a, b) => a.order - b.order);
    const shotItems = shots.flatMap((sh) => {
      const cs = p.clips.filter((c) => c.approved && c.shotId === sh.id);
      if (!cs.length) return [];
      const pick = cs.find((c) => inTl.has(c.id)) ?? cs[cs.length - 1];
      return [inTl.get(pick.id) ?? { id: newId("tl"), clipId: pick.id, trimStart: 0, trimEnd: 0, audio: true }];
    });
    if (shotItems.length) {
      out.push(...shotItems);
      covered.add(s.id);
      continue;
    }
    const cands = p.clips.filter((c) => c.approved && !c.shotId && c.sceneIds[0] === s.id && c.sceneIds.every((id) => !covered.has(id)));
    if (!cands.length) continue;
    const pick = cands.find((c) => inTl.has(c.id)) ?? cands[cands.length - 1];
    out.push(inTl.get(pick.id) ?? { id: newId("tl"), clipId: pick.id, trimStart: 0, trimEnd: 0, audio: true });
    for (const id of pick.sceneIds) covered.add(id);
  }
  for (const t of p.timeline) {
    const c = p.clips.find((x) => x.id === t.clipId);
    if (c && !c.sceneIds.length && !out.some((x) => x.id === t.id)) out.push(t);
  }
  return out;
}
