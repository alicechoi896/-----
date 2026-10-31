/**
 * AI 드라마 스튜디오 (v0.9.81) — 프로젝트 문서 타입. docs/DRAMA_STUDIO.md
 * 프로젝트 1개 = Storage 비공개 버킷 'videos' 의 {owner}/drama/{projectId}/project.json (DB 테이블 추가 없음).
 * 이미지·영상 파일도 같은 폴더 아래에 둔다 → 기존 사용자 폴더 권한(RLS)이 그대로 적용된다.
 * 등장인물·장면은 이름이 아니라 내부 ID(c_…, sc_…)로 연결한다.
 */

export type StepKey = "ideas" | "select" | "story" | "characters" | "sheets" | "scenario" | "storyboard" | "video";
/** empty 아직 없음 · draft 작업 중 · approved 승인 · review 앞 단계가 바뀌어 재검토 필요 · skipped 중간부터 시작해 건너뜀 */
export type StepStatus = "empty" | "draft" | "approved" | "review" | "skipped";

export interface StepState {
  status: StepStatus;
  /** 승인할 때마다 1씩 */
  version: number;
  approvedAt: string | null;
}

export type Aspect = "9:16" | "16:9";

export interface DramaSettings {
  idea: string;
  genre: string;
  mood: string;
  targetSec: number;
  aspect: Aspect;
  audience: string;
  mustHave: string;
}

export interface DramaIdea {
  id: string;
  title: string;
  concept: string;
  conflict: string;
  hook: string;
  twist: string;
  fit: string;
  favorite: boolean;
}

export interface DramaSelection {
  ideaId: string | null;
  /** 고른 아이디어 (직접 고친 내용) */
  idea: DramaIdea | null;
  memo: string;
  suggestions: string[];
}

export interface DramaStory {
  workingTitle: string;
  loglines: string[];
  /** 고른 로그라인 (-1 = 직접 입력) */
  loglineIndex: number;
  customLogline: string;
  theme: string;
  goal: string;
  lack: string;
  conflict: string;
  twist: string;
  ending: string;
  message: string;
  hookStrategy: string;
}

export interface DramaRelation {
  targetId: string;
  relation: string;
}

export interface DramaCharacter {
  id: string;
  name: string;
  role: string;
  age: string;
  gender: string;
  appearance: string;
  /** 이미지·영상 프롬프트용 영어 외모 묘사 */
  appearanceEn: string;
  outfit: string;
  personality: string;
  desire: string;
  weakness: string;
  secret: string;
  conflict: string;
  relations: DramaRelation[];
  arc: string;
  speech: string;
}

export type SheetKind = "front" | "side" | "full" | "expression" | "outfit" | "extra";

/** 생성·업로드한 이미지 (캐릭터 시트·스토리보드 공용) */
export interface DramaImage {
  id: string;
  /** Storage 키 (영구 보관) */
  key: string;
  prompt: string;
  modelId: string;
  source: "ai" | "upload";
  createdAt: string;
  version: number;
  /** 캐릭터 시트: 기준 이미지로 고정 / 스토리보드: 승인 */
  approved: boolean;
  /** 캐릭터 시트 종류 */
  kind?: SheetKind;
  fileName?: string;
  /** v0.9.89: 화면에서 [목록에서 빼기] — 서버는 이 표시가 있을 때만 뺀다 (목록에 없다고 지우지 않음) */
  removed?: boolean;
}

export interface SceneEnPrompt {
  subject: string;
  action: string;
  environment: string;
  camera: string;
  lighting: string;
  color: string;
}

export interface DramaScene {
  id: string;
  title: string;
  location: string;
  timeOfDay: string;
  characterIds: string[];
  action: string;
  dialogue: string;
  emotion: string;
  camera: string;
  visual: string;
  durationSec: number;
  sound: string;
  /** 이전 장면에서 이어지는 소품·의상·시간대 */
  continuity: string;
  /** 영어 프롬프트 조각 (AI 가 시나리오에서 만든다) */
  en: SceneEnPrompt | null;
  /** 직접 고친 이미지 프롬프트 (비우면 자동) */
  imagePrompt: string;
  /** 직접 고친 영상 프롬프트 (비우면 자동) */
  videoPrompt: string;
}

export interface DramaScenario {
  title: string;
  synopsis: string;
  acts: { setup: string; development: string; crisis: string; climax: string; ending: string };
  twist: string;
  sceneCount: number;
  style: "dialogue" | "visual";
  endingType: string;
  scenes: DramaScene[];
}

export type GenMode = "first_frame" | "first_last" | "reference" | "multi_shot" | "text";

export type TaskStatus = "queued" | "requesting" | "generating" | "success" | "fail";

/** Kie 작업 (이미지·영상). 서버만 쓴다 */
export interface DramaTask {
  id: string;
  kind: "image" | "video";
  target: { type: "sheet"; charId: string; sheetKind: SheetKind } | { type: "frame"; sceneId: string } | { type: "clip"; sceneIds: string[] };
  modelId: string;
  mode: GenMode;
  prompt: string;
  durationSec: number | null;
  /** 실제로 보낸 input (이미지 주소는 Storage 키로 바꿔 둔다) */
  request: Record<string, unknown>;
  status: TaskStatus;
  externalTaskId: string | null;
  resultUrl: string | null;
  storedKey: string | null;
  /** 결과로 만든 이미지·클립 id */
  assetId: string | null;
  error: string | null;
  credits: number | null;
  estimatedCredits: number | null;
  requestId: string;
  /** v0.9.87: 이 작업(같은 인물의 기준 이미지)이 끝나면 그 결과를 참고로 넣어 보낸다 */
  dependsOn?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DramaClip {
  id: string;
  sceneIds: string[];
  key: string;
  source: "ai" | "upload";
  modelId: string;
  mode: GenMode | "upload";
  prompt: string;
  durationSec: number;
  createdAt: string;
  approved: boolean;
  taskId: string | null;
  fileName?: string;
}

export interface TimelineItem {
  id: string;
  clipId: string;
  trimStart: number;
  trimEnd: number;
  audio: boolean;
  /** v0.9.92: 이 클립 자막 (한 줄씩). null·없음 = 장면 대사에서 자동 */
  subtitle?: string | null;
}

export interface RenderSettings {
  transition: "none" | "fade";
  bgmKey: string | null;
  bgmName: string | null;
  bgmVolume: number;
  title: string;
  /** v0.9.92: 자막 넣기 (장면 대사 → 화면 아래) */
  subtitles?: boolean;
  subtitleSize?: "s" | "m" | "l";
  /** v0.9.92: 왼쪽 위 로고 (올린 이미지) */
  logoKey?: string | null;
  logoName?: string | null;
}

export interface DramaRender {
  id: string;
  version: number;
  status: "running" | "success" | "fail";
  totalSec: number | null;
  key: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  step: StepKey;
  version: number;
  at: string;
  /** 승인 당시 내용 (글 단계만) */
  snapshot: unknown;
}

export interface ScenarioVersion {
  id: string;
  label: string;
  at: string;
  scenario: DramaScenario;
}

export interface DramaProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** 저장할 때마다 1씩 (화면이 오래된 내용으로 덮지 않게) */
  rev: number;
  currentStep: StepKey;
  settings: DramaSettings;
  steps: Record<StepKey, StepState>;
  approvals: ApprovalRecord[];
  ideas: DramaIdea[];
  selection: DramaSelection;
  story: DramaStory;
  characters: DramaCharacter[];
  sheets: Record<string, DramaImage[]>;
  scenario: DramaScenario;
  scenarioVersions: ScenarioVersion[];
  storyboard: Record<string, DramaImage[]>;
  tasks: DramaTask[];
  clips: DramaClip[];
  timeline: TimelineItem[];
  renderSettings: RenderSettings;
  renders: DramaRender[];
}

export interface DramaProjectSummary {
  id: string;
  title: string;
  currentStep: StepKey;
  updatedAt: string;
  createdAt: string;
  approved: number;
}

/** 화면이 저장할 수 있는 부분 (tasks·renders 는 서버만) */
export type EditableSection =
  | "title"
  | "currentStep"
  | "settings"
  | "ideas"
  | "selection"
  | "story"
  | "characters"
  | "sheets"
  | "scenario"
  | "storyboard"
  | "clips"
  | "timeline"
  | "renderSettings";
