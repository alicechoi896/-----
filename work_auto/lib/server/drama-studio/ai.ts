import "server-only";
import { getAIProvider } from "../providers/registry";
import { AppError } from "../http";
import { chosenLogline, emptyScene, fitDurations, newId } from "@/lib/drama-studio/steps";
import type { DramaCharacter, DramaIdea, DramaProject, DramaScenario, DramaScene, DramaStory, SceneEnPrompt } from "@/lib/drama-studio/types";

/**
 * 드라마 스튜디오 AI 글 생성 (v0.9.81) — 연결된 AI(Claude/OpenAI)로. 버튼 1번 = AI 1~몇 회, 자동 재시도 없음.
 * 데모(Mock AI)는 정해진 시험용 결과를 만든다.
 */
type Json = Record<string, unknown>;
const S = { type: "string" } as const;
const arr = (items: Json) => ({ type: "array", items });
const obj = (props: Record<string, Json>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
/** 스키마 → JSON 모양 안내 (예: {"ideas":[{"title":"…"}]}) */
function shape(schema: Json): string {
  const walk = (s: Json): unknown => {
    if (s.type === "object") return Object.fromEntries(Object.entries((s.properties as Record<string, Json>) ?? {}).map(([k, v]) => [k, walk(v)]));
    if (s.type === "array") return [walk(s.items as Json)];
    return s.type === "number" ? 0 : "…";
  };
  return JSON.stringify(walk(schema));
}
const str = (v: unknown, max = 600) => String(v ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);

async function ask<T extends Json>(task: string, system: string, user: string, schema: Json, mock: () => T, maxTokens = 8000): Promise<{ data: T; aiCalls: number }> {
  const ai = await getAIProvider();
  if (ai.id === "mock") return { data: mock(), aiCalls: 0 };
  try {
    const { data } = await ai.generateStructured<T>({
      task: `drama-studio:${task}`,
      messages: [
        { role: "system", content: `${system}\n답은 JSON 객체 하나로만 한다 (설명·마크다운 없이). 형식: ${shape(schema)}` },
        { role: "user", content: user },
      ],
      outputKeys: Object.keys((schema.properties as Json) ?? {}),
      jsonSchema: schema,
      variables: {},
      maxTokens,
    });
    return { data, aiCalls: 1 };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("AI_ERROR", `AI 가 결과를 만들지 못했습니다 (${e instanceof Error ? e.message.slice(0, 120) : "알 수 없음"}). 다시 눌러 주세요.`, 502);
  }
}

const SYSTEM = "당신은 한국 숏폼(쇼츠) 드라마 기획·각본가다. 1~3분 세로 영상으로 찍을 수 있는 이야기를 쓴다. 첫 3초 후킹과 반전을 중시하고, 실제 배우·AI 영상으로 찍을 수 있는 구체적인 장면만 쓴다. 한국어로 답한다.";

function brief(p: DramaProject): string {
  const s = p.settings;
  return [
    `[아이디어] ${s.idea || "(자유)"}`,
    `[장르] ${s.genre} · [분위기] ${s.mood} · [목표 길이] ${s.targetSec}초 · [화면] ${s.aspect}`,
    s.audience ? `[타깃 시청자] ${s.audience}` : "",
    s.mustHave ? `[반드시 넣을 설정] ${s.mustHave}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function storyBrief(p: DramaProject): string {
  const i = p.selection.idea;
  const st = p.story;
  return [
    brief(p),
    i ? `[선택한 아이디어] ${i.title} — ${i.concept} / 갈등: ${i.conflict} / 후킹: ${i.hook} / 반전: ${i.twist}` : "",
    p.selection.memo ? `[메모] ${p.selection.memo}` : "",
    st.workingTitle ? `[가제] ${st.workingTitle}` : "",
    chosenLogline(st) ? `[로그라인] ${chosenLogline(st)}` : "",
    st.theme ? `[주제] ${st.theme} · [주인공 목표] ${st.goal} · [결핍] ${st.lack} · [핵심 갈등] ${st.conflict} · [반전] ${st.twist} · [결말] ${st.ending} · [메시지] ${st.message} · [후킹 전략] ${st.hookStrategy}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const castBrief = (cs: DramaCharacter[]) =>
  cs.map((c) => `- ${c.id} ${c.name} (${c.role}, ${c.age}, ${c.gender}): 외모 ${c.appearance} / 의상 ${c.outfit} / 성격 ${c.personality} / 말투 ${c.speech}`).join("\n");

/* ───── 1. 아이디어 ───── */
const IDEA = obj({ title: S, concept: S, conflict: S, hook: S, twist: S, fit: S });
const toIdea = (r: Json): DramaIdea => ({ id: newId("id"), title: str(r.title, 60), concept: str(r.concept, 300), conflict: str(r.conflict, 300), hook: str(r.hook, 300), twist: str(r.twist, 300), fit: str(r.fit, 300), favorite: false });
const mockIdea = (i: number, base = "아이디어"): Json => ({ title: `${base} ${i + 1}: 마지막 문자`, concept: "헤어진 연인의 마지막 문자가 1년 뒤 도착한다.", conflict: "보낸 사람이 연인이 아니라는 사실", hook: "'이 문자를 받으면 바로 지워'라는 알림", twist: "문자를 보낸 건 미래의 나", fit: "장소 2곳·인물 3명으로 짧게 찍기 쉽다" });

export async function genIdeas(p: DramaProject, count = 20, avoid: string[] = []) {
  const r = await ask<{ ideas: Json[] }>(
    "ideas",
    SYSTEM,
    `${brief(p)}\n\n위 조건으로 서로 다른 쇼츠 드라마 아이디어 ${count}개를 만든다. 비슷한 이야기를 반복하지 말고 소재·배경·관계·반전 구조를 고루 다르게.${avoid.length ? `\n이미 나온 제목(피할 것): ${avoid.slice(0, 40).join(", ")}` : ""}\n각 항목: title(제목), concept(한 줄 콘셉트), conflict(핵심 갈등), hook(첫 3초 후킹), twist(예상 반전), fit(쇼츠 드라마로 적합한 이유).`,
    obj({ ideas: arr(IDEA) }),
    () => ({ ideas: Array.from({ length: count }, (_, i) => mockIdea(i)) }),
    12000,
  );
  return { ideas: (r.data.ideas ?? []).slice(0, count).map(toIdea), aiCalls: r.aiCalls };
}

export async function genSimilar(p: DramaProject, base: DramaIdea, count = 5) {
  const r = await ask<{ ideas: Json[] }>(
    "ideas-similar",
    SYSTEM,
    `${brief(p)}\n\n[기준 아이디어] ${base.title} — ${base.concept} / 반전: ${base.twist}\n이 아이디어와 결은 같지만 설정·반전이 다른 변형 ${count}개를 만든다. 각 항목: title, concept, conflict, hook, twist, fit.`,
    obj({ ideas: arr(IDEA) }),
    () => ({ ideas: Array.from({ length: count }, (_, i) => mockIdea(i, `${base.title} 변형`)) }),
  );
  return { ideas: (r.data.ideas ?? []).slice(0, count).map(toIdea), aiCalls: r.aiCalls };
}

/* ───── 2. 선택 개선 제안 ───── */
export async function genImprove(p: DramaProject) {
  const i = p.selection.idea;
  if (!i) throw new AppError("VALIDATION", "먼저 아이디어를 골라 주세요.");
  const r = await ask<{ suggestions: string[]; improved: Json }>(
    "select-improve",
    SYSTEM,
    `${brief(p)}\n\n[선택한 아이디어] ${JSON.stringify(i)}\n${p.selection.memo ? `[메모] ${p.selection.memo}\n` : ""}이 아이디어를 쇼츠 드라마로 더 강하게 만드는 개선 제안 3~5개(suggestions)와, 제안을 반영해 다듬은 아이디어(improved: title, concept, conflict, hook, twist, fit)를 준다.`,
    obj({ suggestions: arr(S), improved: IDEA }),
    () => ({ suggestions: ["첫 장면에 결정적 증거를 먼저 보여 주세요.", "조력자의 비밀을 중반에 드러내면 긴장이 커집니다."], improved: { ...mockIdea(0), title: `${i.title} (다듬음)` } }),
  );
  return { suggestions: (r.data.suggestions ?? []).map((s) => str(s, 300)).slice(0, 6), improved: { ...toIdea(r.data.improved ?? {}), id: i.id }, aiCalls: r.aiCalls };
}

/* ───── 3. 로그라인·주제 ───── */
export async function genStory(p: DramaProject) {
  const r = await ask<Json>(
    "story",
    SYSTEM,
    `${storyBrief(p)}\n\n이 아이디어로 작품 가제(workingTitle), 로그라인 3가지(loglines, 각 1~2문장), 핵심 주제(theme), 주인공의 목표(goal), 주인공의 결핍(lack), 핵심 갈등(conflict), 이야기의 반전(twist), 결말 방향(ending), 감정적 메시지(message), 시작 3초 후킹 전략(hookStrategy)을 쓴다.`,
    obj({ workingTitle: S, loglines: arr(S), theme: S, goal: S, lack: S, conflict: S, twist: S, ending: S, message: S, hookStrategy: S }),
    () => ({ workingTitle: "마지막 문자", loglines: ["1년 전 헤어진 연인에게서 온 문자를 따라간 여자가, 자신이 몰랐던 진실과 마주한다.", "지워야 하는 문자를 지우지 못한 여자가 미래를 바꾸려 한다.", "문자 한 통이 두 사람의 1년을 되돌린다."], theme: "놓친 마음", goal: "문자를 보낸 사람 찾기", lack: "후회를 마주하지 못함", conflict: "진실을 숨기는 친구", twist: "보낸 사람은 미래의 나", ending: "열린 결말", message: "지금 말해야 한다", hookStrategy: "알림 소리 + 화면 가득 문자" }),
  );
  const d = r.data;
  const story: DramaStory = {
    workingTitle: str(d.workingTitle, 60),
    loglines: (Array.isArray(d.loglines) ? d.loglines : []).map((x) => str(x, 300)).slice(0, 3),
    loglineIndex: 0,
    customLogline: "",
    theme: str(d.theme),
    goal: str(d.goal),
    lack: str(d.lack),
    conflict: str(d.conflict),
    twist: str(d.twist),
    ending: str(d.ending),
    message: str(d.message),
    hookStrategy: str(d.hookStrategy),
  };
  return { story, aiCalls: r.aiCalls };
}

/* ───── 4. 등장인물 ───── */
const CHAR = obj({ name: S, role: S, age: S, gender: S, appearance: S, appearanceEn: S, outfit: S, personality: S, desire: S, weakness: S, secret: S, conflict: S, relations: arr(obj({ name: S, relation: S })), arc: S, speech: S });
const CHAR_GUIDE =
  "각 인물: name, role(주인공·적대자·조력자·조연 등), age, gender, appearance(외모 특징, 한국어), appearanceEn(이미지 생성용 영어 외모·헤어·의상 묘사 1~2문장, 한국인 배우로), outfit(의상), personality, desire(욕망과 목표), weakness(약점), secret(숨겨진 비밀), conflict(주요 갈등), relations(다른 인물과의 관계: name, relation), arc(극 중 변화), speech(말투와 대화 특징).";
const mockChar = (i: number): Json => ({ name: ["서윤", "도현", "하은", "민재"][i % 4] + (i >= 4 ? i : ""), role: ["주인공", "적대자", "조력자", "조연"][i % 4], age: "20대 후반", gender: i % 2 ? "남성" : "여성", appearance: "단발 검은 머리, 큰 눈", appearanceEn: "Korean woman in her late 20s, short straight black bob hair, wearing a beige trench coat", outfit: "베이지 트렌치코트", personality: "침착하지만 고집이 셈", desire: "진실을 알고 싶다", weakness: "사람을 쉽게 믿는다", secret: "1년 전 그날 현장에 있었다", conflict: "친구를 의심해야 한다", relations: [], arc: "후회를 마주한다", speech: "짧고 단정한 존댓말" });

function toChar(r: Json, byName: Map<string, string>, keepId?: string): DramaCharacter {
  const rel = Array.isArray(r.relations) ? (r.relations as Json[]) : [];
  return {
    id: keepId ?? newId("c"),
    name: str(r.name, 20) || "이름 없음",
    role: str(r.role, 30),
    age: str(r.age, 20),
    gender: str(r.gender, 20),
    appearance: str(r.appearance, 300),
    appearanceEn: str(r.appearanceEn, 400),
    outfit: str(r.outfit, 200),
    personality: str(r.personality, 300),
    desire: str(r.desire, 300),
    weakness: str(r.weakness, 300),
    secret: str(r.secret, 300),
    conflict: str(r.conflict, 300),
    relations: rel.map((x) => ({ targetId: byName.get(str(x.name, 20)) ?? "", relation: str(x.relation, 100) })).filter((x) => x.targetId),
    arc: str(r.arc, 300),
    speech: str(r.speech, 200),
  };
}

export async function genCharacters(p: DramaProject) {
  const r = await ask<{ characters: Json[] }>(
    "characters",
    SYSTEM,
    `${storyBrief(p)}\n\n이 이야기에 필요한 등장인물을 설계한다 (보통 3~6명, 필요한 만큼). ${CHAR_GUIDE}`,
    obj({ characters: arr(CHAR) }),
    () => ({ characters: [0, 1, 2].map(mockChar) }),
  );
  const raw = (r.data.characters ?? []).slice(0, 12);
  // 이름 → ID 를 먼저 정하고 관계를 ID 로 잇는다
  const ids = raw.map(() => newId("c"));
  const byName = new Map(raw.map((x, i) => [str(x.name, 20), ids[i]]));
  return { characters: raw.map((x, i) => toChar(x, byName, ids[i])), aiCalls: r.aiCalls };
}

export async function genCharacterOne(p: DramaProject, target: DramaCharacter, note: string) {
  const r = await ask<Json>(
    "character-one",
    SYSTEM,
    `${storyBrief(p)}\n\n[다른 인물]\n${castBrief(p.characters.filter((c) => c.id !== target.id))}\n\n[다시 만들 인물] ${JSON.stringify({ name: target.name, role: target.role })}${note ? `\n[요청] ${note}` : ""}\n이 인물을 다시 설계한다. ${CHAR_GUIDE}`,
    CHAR,
    () => ({ ...mockChar(1), name: target.name || "새 인물", role: target.role || "조연" }),
  );
  const byName = new Map(p.characters.map((c) => [c.name, c.id]));
  return { character: toChar(r.data, byName, target.id), aiCalls: r.aiCalls };
}

/* ───── 6. 시나리오 ───── */
const SCENE = obj({ title: S, location: S, timeOfDay: S, characters: arr(S), action: S, dialogue: S, emotion: S, camera: S, visual: S, estimatedDuration: { type: "number" }, sound: S, continuity: S });
const SCENE_GUIDE =
  `장면마다: title, location(공간), timeOfDay(시간대), characters(등장인물 이름 배열), action(인물 행동), dialogue(대사, '이름: 대사' 줄바꿈), emotion(감정 변화), camera(카메라 연출), visual(화면 묘사), estimatedDuration(초, 6~12 — 그 행동을 처음부터 끝까지 보여 주는 데 필요한 시간), sound(효과음·음악), continuity(앞 장면에서 이어지는 소품·의상·시간대·상처 등 연속성 메모).
장면 규칙 (영상 품질에 가장 중요):
1) 한 장면 = 카메라 한 번으로 찍는 연속된 행동 하나. 그 장면 안에서 행동이 시작되고 끝난다 (예: '램프를 발견해 집어 들고 소매로 문지르자 연기가 피어오른다'). 행동을 다음 장면으로 넘기지 않는다.
2) 이야기의 중요한 순간(발견·변신·고백·반전·결정)은 반드시 화면에 직접 보이게 한 장면을 준다. 결과만 다음 장면에 보여 주지 않는다.
3) 같은 장소가 이어지면 앞 장면의 마지막 모습(자세·위치·들고 있는 물건)에서 다음 장면이 시작되게 쓴다. 장소가 바뀌는 장면은 location 을 분명히 바꿔 쓴다.
4) 등장인물의 외모·머리·의상은 처음부터 끝까지 절대 바꾸지 않는다 (상처·젖음 같은 변화는 continuity 에 적고 이어지게). 같은 인물을 다른 모습으로 묘사하지 않는다.
5) 한 장면에 장소 이동·시간 점프를 넣지 않는다.`;

function toScene(r: Json, cast: DramaCharacter[]): DramaScene {
  const names = Array.isArray(r.characters) ? (r.characters as unknown[]).map((x) => str(x, 20)) : [];
  return emptyScene({
    title: str(r.title, 80),
    location: str(r.location, 100),
    timeOfDay: str(r.timeOfDay, 30),
    characterIds: cast.filter((c) => names.some((n) => n && (n === c.name || n.includes(c.name)))).map((c) => c.id),
    action: str(r.action, 800),
    dialogue: str(r.dialogue, 1200),
    emotion: str(r.emotion, 200),
    camera: str(r.camera, 300),
    visual: str(r.visual, 800),
    durationSec: Math.min(15, Math.max(4, Math.round(Number(r.estimatedDuration) || 8))),
    sound: str(r.sound, 200),
    continuity: str(r.continuity, 300),
  });
}

const mockScene = (i: number, cast: DramaCharacter[]): Json => ({
  title: `장면 ${i + 1}`,
  location: i % 2 ? "카페" : "아파트 거실",
  timeOfDay: i < 12 ? "밤" : "아침",
  characters: cast.slice(0, 2).map((c) => c.name),
  action: "휴대폰 알림을 확인하고 놀란다.",
  dialogue: `${cast[0]?.name ?? "서윤"}: 이게 왜 지금 와?`,
  emotion: "당황 → 결심",
  camera: "휴대폰 화면 클로즈업 후 얼굴로 틸트업",
  visual: "어두운 방, 휴대폰 불빛만 얼굴을 비춘다",
  estimatedDuration: 5,
  sound: "알림음",
  continuity: "베이지 트렌치코트, 왼손에 휴대폰",
});

export async function genScenario(p: DramaProject, sceneCount: number, style: "dialogue" | "visual", endingType: string): Promise<{ scenario: DramaScenario; aiCalls: number }> {
  const cast = p.characters;
  const ctx = `${storyBrief(p)}\n\n[등장인물]\n${castBrief(cast)}\n[장면 수] ${sceneCount} · [결말 유형] ${endingType} · [중심] ${style === "dialogue" ? "대사 중심" : "영상 연출 중심(대사 적게)"} · [전체 길이] 약 ${p.settings.targetSec}초`;
  // 1) 큰 줄거리 + 장면별 비트
  const outline = await ask<Json>(
    "scenario-outline",
    SYSTEM,
    `${ctx}\n\n작품 제목(title), 전체 줄거리(synopsis), 발단·전개·위기·절정·결말(acts: setup, development, crisis, climax, ending), 반전(twist), 장면별 비트(beats: 정확히 ${sceneCount}개, 각 1~2문장으로 무슨 일이 일어나는지·장소·시간대)를 쓴다. 비트 하나는 카메라 한 번에 찍는 연속된 행동 하나이고, 이야기의 중요한 순간(발견·변신·반전 등)은 반드시 비트로 직접 보여 준다 (건너뛰고 결과만 보여 주지 않는다).`,
    obj({ title: S, synopsis: S, acts: obj({ setup: S, development: S, crisis: S, climax: S, ending: S }), twist: S, beats: arr(S) }),
    () => ({ title: "마지막 문자", synopsis: "1년 만에 온 문자가 모든 것을 바꾼다.", acts: { setup: "문자 도착", development: "보낸 사람 추적", crisis: "친구의 거짓말", climax: "진실 대면", ending: "새 문자" }, twist: "보낸 사람은 미래의 나", beats: Array.from({ length: sceneCount }, (_, i) => `비트 ${i + 1}`) }),
    6000,
  );
  const beats = (Array.isArray(outline.data.beats) ? outline.data.beats : []).map((b) => str(b, 300));
  while (beats.length < sceneCount) beats.push("이야기를 이어 간다.");
  // 2) 장면을 8개씩 나눠 동시에 쓴다 (전체 비트를 함께 줘서 연속성 유지)
  const chunks: number[][] = [];
  for (let i = 0; i < sceneCount; i += 8) chunks.push(Array.from({ length: Math.min(8, sceneCount - i) }, (_, k) => i + k));
  const parts = await Promise.all(
    chunks.map((idx) =>
      ask<{ scenes: Json[] }>(
        "scenario-scenes",
        SYSTEM,
        `${ctx}\n\n[줄거리] ${str(outline.data.synopsis, 1500)}\n[전체 비트]\n${beats.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\n이 중 ${idx[0] + 1}~${idx[idx.length - 1] + 1}번 장면을 실제로 찍을 수 있게 자세히 쓴다 (정확히 ${idx.length}개, 순서대로). 앞뒤 장면과 소품·의상·시간대가 모순되지 않게. ${SCENE_GUIDE}`,
        obj({ scenes: arr(SCENE) }),
        () => ({ scenes: idx.map((i) => mockScene(i, cast)) }),
        12000,
      ),
    ),
  );
  // v0.9.94: 장면 길이 합을 목표 길이에 맞춘다 (3분이면 180초)
  const scenes = fitDurations(parts.flatMap((x) => (x.data.scenes ?? []).slice(0, 8)).map((r) => toScene(r, cast)), p.settings.targetSec);
  const a = (outline.data.acts ?? {}) as Json;
  return {
    scenario: {
      title: str(outline.data.title, 80),
      synopsis: str(outline.data.synopsis, 2000),
      acts: { setup: str(a.setup), development: str(a.development), crisis: str(a.crisis), climax: str(a.climax), ending: str(a.ending) },
      twist: str(outline.data.twist),
      sceneCount,
      style,
      endingType,
      scenes,
    },
    aiCalls: outline.aiCalls + parts.reduce((n, x) => n + x.aiCalls, 0),
  };
}

export async function genSceneRewrite(p: DramaProject, sceneId: string, note: string) {
  const list = p.scenario.scenes;
  const i = list.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new AppError("NOT_FOUND", "장면을 찾지 못했습니다.", 404);
  const near = (s?: DramaScene) => (s ? `${s.title}: ${s.action} / ${s.dialogue.replace(/\n/g, " ")} / 연속성: ${s.continuity}` : "(없음)");
  const r = await ask<Json>(
    "scenario-scene",
    SYSTEM,
    `${storyBrief(p)}\n\n[등장인물]\n${castBrief(p.characters)}\n[줄거리] ${p.scenario.synopsis}\n[앞 장면] ${near(list[i - 1])}\n[지금 장면 ${i + 1}] ${JSON.stringify({ title: list[i].title, action: list[i].action, dialogue: list[i].dialogue })}\n[뒤 장면] ${near(list[i + 1])}\n${note ? `[요청] ${note}\n` : ""}이 장면 하나를 다시 쓴다. 앞뒤 장면과 이어지게. ${SCENE_GUIDE}`,
    SCENE,
    () => mockScene(i, p.characters),
  );
  const scene = { ...toScene(r.data, p.characters), id: sceneId };
  return { scene, aiCalls: r.aiCalls };
}

/** 빠른 시작: 붙여 넣은 시나리오 글 → 장면 */
export async function genParseScenario(p: DramaProject, text: string) {
  const r = await ask<{ title: string; scenes: Json[] }>(
    "scenario-parse",
    SYSTEM,
    `[등장인물]\n${castBrief(p.characters) || "(없음)"}\n\n[시나리오 글]\n${text.slice(0, 30000)}\n\n위 글을 장면 단위로 나눠 정리한다 (내용을 지어내지 말고 글에 있는 대로, 빠진 칸은 글에서 추론할 수 있는 만큼만). title(작품 제목)과 scenes. ${SCENE_GUIDE}`,
    obj({ title: S, scenes: arr(SCENE) }),
    () => ({ title: "붙여 넣은 시나리오", scenes: text.split(/\n{2,}/).filter((x) => x.trim()).slice(0, 60).map((t, i) => ({ ...mockScene(i, p.characters), action: t.slice(0, 300) })) }),
    16000,
  );
  return { title: str(r.data.title, 80), scenes: (r.data.scenes ?? []).slice(0, 60).map((x) => toScene(x, p.characters)), aiCalls: r.aiCalls };
}

/* ───── 영어 프롬프트 조각 (이미지·영상용) ───── */
const EN = obj({ id: S, subject: S, action: S, environment: S, camera: S, lighting: S, color: S });
export async function genEnglishPrompts(p: DramaProject, sceneIds: string[]) {
  const scenes = p.scenario.scenes.filter((s) => sceneIds.includes(s.id));
  const chunks: DramaScene[][] = [];
  for (let i = 0; i < scenes.length; i += 10) chunks.push(scenes.slice(i, i + 10));
  const name = (id: string) => p.characters.find((c) => c.id === id)?.name ?? id;
  const parts = await Promise.all(
    chunks.map((list) =>
      ask<{ scenes: Json[] }>(
        "scenario-en",
        "You write concise English prompts for AI image and video generation from Korean drama scenes. Keep Korean character names as written. Be concrete and visual.",
        `Characters:\n${p.characters.map((c) => `- ${c.name}: ${c.appearanceEn || c.appearance}`).join("\n")}\n\nScenes (Korean):\n${list.map((s) => JSON.stringify({ id: s.id, title: s.title, location: s.location, time: s.timeOfDay, characters: s.characterIds.map(name), action: s.action, emotion: s.emotion, camera: s.camera, visual: s.visual })).join("\n")}\n\nFor each scene return: id (same), subject (who is in frame and how they look, 1 sentence), action (what happens, 1-2 sentences), environment (place and time), camera (shot size and movement), lighting, color (color grade and texture). English only.`,
        obj({ scenes: arr(EN) }),
        () => ({ scenes: list.map((s) => ({ id: s.id, subject: "A Korean woman in a beige trench coat", action: "She looks at her phone in shock", environment: "dark apartment living room at night", camera: "close-up, slow push-in", lighting: "phone screen light on her face", color: "cool teal tones, film grain" })) }),
        8000,
      ),
    ),
  );
  const out = new Map<string, SceneEnPrompt>();
  for (const r of parts.flatMap((x) => x.data.scenes ?? [])) {
    const id = str(r.id, 40);
    if (scenes.some((s) => s.id === id)) out.set(id, { subject: str(r.subject, 400), action: str(r.action, 600), environment: str(r.environment, 300), camera: str(r.camera, 200), lighting: str(r.lighting, 200), color: str(r.color, 200) });
  }
  return { prompts: out, aiCalls: parts.reduce((n, x) => n + x.aiCalls, 0) };
}
