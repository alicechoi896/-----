import type { DramaProject, DramaScenario, DramaScene, DramaSettings, DramaStory, EditableSection, StepKey, StepState } from "./types";

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
};

export const GENRES = ["로맨스", "복수", "판타지", "사극", "스릴러", "코미디", "미스터리", "가족", "기타"] as const;
export const MOODS = ["감동", "긴장", "반전", "통쾌함", "코믹", "설렘", "미스터리"] as const;
export const TARGET_SECONDS = [60, 90, 120, 180] as const;
export const DEFAULT_SCENE_COUNT = 25;
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
    scenario: emptyScenario(),
    scenarioVersions: [],
    storyboard: {},
    tasks: [],
    clips: [],
    timeline: [],
    renderSettings: { transition: "none", bgmKey: null, bgmName: null, bgmVolume: 0.2, title: title },
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
  if (s.status === "empty" || s.status === "skipped" || wasApproved) p.steps[step] = { ...s, status: "draft" };
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
