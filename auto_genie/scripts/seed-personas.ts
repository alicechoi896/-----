/**
 * 페르소나 예시 데이터 시드 스크립트
 * ------------------------------------------------------------------------
 * "쇼츠 유튜버", "블로거", "제품 판매 셀러" 세 워크스페이스에 각각 전체
 * 스키마(조직/멤버십/지식그래프/의사결정규칙/데이터소스/청크/근거/브랜드
 * 프로필/선호가중치/캠페인/전략/콘텐츠/성과/학습이력/처리작업로그)에 걸쳐
 * 예시 데이터를 채워 넣는다. `pnpm seed:personas` 로 실행한다.
 *
 * scripts/seed.ts와 동일한 이유로 admin.ts를 import하지 않고 서비스 롤
 * 클라이언트 생성 로직을 이 파일 안에 그대로 재현한다.
 *
 * 기존 "인더업" 데모 계정을 그대로 재사용해 세 워크스페이스의 owner로
 * 등록한다 — 로그인 후 좌측 하단 워크스페이스 전환 메뉴에서 바로 오갈 수
 * 있다. 새 로그인 계정을 만들지 않는다.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database, Json } from "@/types/database";

// ---------------------------------------------------------------------------
// 0. .env.local 로드
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "demo@intheup.example";
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo-password-1234";
// 관리자·기술 시연 모드 토글이 아예 보이지 않는 순수 "일반 사용자 모드" 로그인을
// 별도로 만들어 둔다 — 모든 워크스페이스에 member 권한으로만 등록한다.
const DEMO_MEMBER_EMAIL = process.env.DEMO_MEMBER_EMAIL || "user@intheup.example";
const DEMO_MEMBER_PASSWORD = process.env.DEMO_MEMBER_PASSWORD || "user-password-1234";
const INTHEUP_ORG_NAME = "주식회사 인더업";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "\n[오류] Supabase 환경변수가 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 채워주세요.\n"
  );
  process.exit(1);
}

const supabase = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function log(persona: string, section: string, message: string) {
  console.log(`[${persona}][${section}] ${message}`);
}

type EntityType = Database["public"]["Tables"]["knowledge_entities"]["Row"]["entity_type"];

interface EntitySeed {
  entityType: EntityType;
  name: string;
  summary: string;
  confidence: number;
}

interface RelationSeed {
  source: [EntityType, string];
  target: [EntityType, string];
  relationType: string;
  description: string;
  confidence: number;
}

interface DecisionRuleSeed {
  name: string;
  condition: string;
  action: string;
  reason: string;
  category: string;
  weight: number;
  confidence: number;
}

interface StrategyOptionSeed {
  strategy_type: string;
  title: string;
  summary: string;
  target_problem: string;
  core_message: string;
  content_direction: string;
  funnel_step: string;
  feature_scores: Record<string, number>;
  base_score: number;
  preference_score: number;
  evidence_score: number;
  reasoning: string;
  selected: boolean;
}

interface ContentOutputSeed {
  platform: Database["public"]["Tables"]["content_outputs"]["Row"]["platform"];
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  seoKeywords: string[];
}

interface PersonaSeed {
  key: string;
  orgName: string;
  industry: string;
  description: string;
  note: string;
  companyText: string;
  chunkContents: [string, string];
  entities: EntitySeed[];
  relations: RelationSeed[];
  decisionRules: DecisionRuleSeed[];
  brandProfile: {
    coreMessage: string;
    tone: string[];
    preferredExpressions: string[];
    prohibitedExpressions: string[];
    targetAudiences: string[];
    persuasionStructure: string[];
    expertiseAreas: string[];
  };
  preferenceWeights: {
    clarity: number;
    authority: number;
    purchaseLink: number;
    brandFit: number;
    novelty: number;
    empathy: number;
  };
  campaign: {
    name: string;
    goal: Database["public"]["Tables"]["campaigns"]["Row"]["goal"];
    audience: string;
    platforms: string[];
  };
  strategyOptions: StrategyOptionSeed[];
  contentProjectTitle: string;
  contentOutputs: ContentOutputSeed[];
  performance: { views: number; performanceScore: number }[];
  performanceAnalysis: {
    whatWorked: string[];
    whatUnderperformed: string[];
    viewsVsPurchaseGap: string;
    keepElements: string[];
    reviseElements: string[];
    nextContentSuggestions: string[];
  };
  weightLearning: { column: string; label: string; before: number; after: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const computeFinal = (base: number, preference: number, evidence: number) =>
  round2(base * 0.5 + preference * 0.25 + evidence * 0.25);

// ---------------------------------------------------------------------------
// 페르소나 1: 쇼츠 운영 유튜버
// ---------------------------------------------------------------------------

const YOUTUBER: PersonaSeed = {
  key: "youtuber",
  orgName: "숏폼스튜디오 채널",
  industry: "유튜브 쇼츠 콘텐츠 제작 및 채널 운영",
  description:
    "시제품 예시 데이터입니다. 매일 쇼츠를 업로드하는 1인 유튜버 워크스페이스로, 조회수 대비 구독 전환이 낮은 문제를 AI 분석으로 개선하는 흐름을 보여줍니다.",
  note: "시제품 예시 데이터입니다.",
  companyText:
    "숏폼스튜디오 채널은 하루 1개씩 유튜브 쇼츠를 업로드하는 1인 크리에이터 채널입니다. " +
    "주제는 '5분 자기계발 루틴'으로, 직장인과 대학생을 대상으로 짧고 실천 가능한 습관 팁을 전달합니다. " +
    "조회수는 꾸준히 나오지만 구독 전환율이 낮고, 매일 업로드를 지속하다 보니 소재 고갈과 편집 시간 부담이 큰 상태입니다. " +
    "쇼츠 후킹 구조 설계와 유튜브 알고리즘 대응 경험을 바탕으로, 최근에는 편집 노하우를 담은 미니 강의도 함께 판매하고 있습니다.",
  chunkContents: [
    "숏폼스튜디오 채널은 하루 1개씩 유튜브 쇼츠를 업로드하는 1인 크리에이터 채널입니다. " +
      "주제는 '5분 자기계발 루틴'으로, 직장인과 대학생을 대상으로 짧고 실천 가능한 습관 팁을 전달합니다.",
    "조회수는 꾸준히 나오지만 구독 전환율이 낮고, 매일 업로드를 지속하다 보니 소재 고갈과 편집 시간 부담이 큰 상태입니다. " +
      "쇼츠 후킹 구조 설계와 유튜브 알고리즘 대응 경험을 바탕으로 편집 노하우 미니 강의도 함께 판매하고 있습니다.",
  ],
  entities: [
    { entityType: "product", name: "쇼츠 후킹 구조 설계 미니 강의", summary: "3초 안에 시청자를 붙잡는 쇼츠 후킹·전개·CTA 구조를 알려주는 실전 미니 강의.", confidence: 0.9 },
    { entityType: "audience", name: "예비 크리에이터", summary: "유튜브를 막 시작했거나 시작을 고민 중인 직장인·학생.", confidence: 0.86 },
    { entityType: "audience", name: "부업 크리에이터", summary: "본업과 병행하며 채널을 운영해 추가 수익을 만들고 싶은 사람.", confidence: 0.8 },
    { entityType: "audience", name: "소상공인 채널 운영자", summary: "자기 사업 홍보를 위해 쇼츠 채널을 직접 운영하는 소상공인.", confidence: 0.76 },
    { entityType: "customer_problem", name: "조회수는 나오는데 구독 전환이 안 됨", summary: "개별 영상 조회수는 높지만 채널 구독으로 이어지지 않는 문제.", confidence: 0.9 },
    { entityType: "customer_problem", name: "매일 업로드 소재가 금방 고갈됨", summary: "꾸준한 업로드 주기를 유지할 소재 기획이 반복적으로 막힘.", confidence: 0.84 },
    { entityType: "customer_problem", name: "알고리즘 노출이 들쭉날쭉함", summary: "비슷한 퀄리티의 영상인데도 노출량 편차가 커서 예측이 어려움.", confidence: 0.78 },
    { entityType: "expertise", name: "쇼츠 후킹 구조 설계", summary: "첫 3초 이탈을 막는 후킹 문구와 전개 구조를 설계하는 실무 노하우.", confidence: 0.88 },
    { entityType: "expertise", name: "유튜브 알고리즘 대응", summary: "시청 지속시간, 반복 재생, 썸네일 클릭률 등 알고리즘 신호에 대응하는 경험.", confidence: 0.83 },
    { entityType: "expertise", name: "숏폼 편집·자막 제작", summary: "캡컷 등으로 빠르게 숏폼을 편집하고 가독성 높은 자막을 넣는 실무 스킬.", confidence: 0.8 },
    { entityType: "desire", name: "구독자를 실제 팬으로 전환하고 싶음", summary: "일회성 조회가 아니라 채널을 계속 찾아오는 팬을 만들고 싶어함.", confidence: 0.79 },
    { entityType: "desire", name: "편집 시간을 줄이고 싶음", summary: "매일 업로드를 지속 가능하게 만들 수 있도록 제작 시간을 단축하고 싶어함.", confidence: 0.75 },
    { entityType: "objection", name: "쇼츠는 금방 잊혀질 콘텐츠라는 인식", summary: "숏폼은 휘발성이 강해 채널 자산으로 남지 않을 것이라는 우려.", confidence: 0.68 },
    { entityType: "solution", name: "후킹·구조화 쇼츠 제작 프레임워크", summary: "첫 3초 후킹부터 CTA까지 반복 가능한 구조로 쇼츠를 기획·제작하는 방법.", confidence: 0.85 },
    { entityType: "solution", name: "소재 뱅크 자동 정리", summary: "촬영 전 아이디어를 카테고리별로 축적해 소재 고갈을 방지하는 방법.", confidence: 0.77 },
    { entityType: "brand_expression", name: "짧고 빠른 템포로 핵심만 전달합니다", summary: "군더더기 없이 임팩트 있는 문장으로 전달하는 톤.", confidence: 0.74 },
  ],
  relations: [
    { source: ["customer_problem", "조회수는 나오는데 구독 전환이 안 됨"], target: ["solution", "후킹·구조화 쇼츠 제작 프레임워크"], relationType: "solved_by", description: "구조화된 후킹·CTA 설계로 구독 전환율 개선.", confidence: 0.82 },
    { source: ["customer_problem", "매일 업로드 소재가 금방 고갈됨"], target: ["solution", "소재 뱅크 자동 정리"], relationType: "solved_by", description: "소재를 미리 축적해두면 업로드 주기를 유지하기 쉬움.", confidence: 0.78 },
    { source: ["desire", "구독자를 실제 팬으로 전환하고 싶음"], target: ["product", "쇼츠 후킹 구조 설계 미니 강의"], relationType: "fulfilled_by", description: "팬 전환을 원하는 니즈를 강의 상품이 충족.", confidence: 0.75 },
    { source: ["product", "쇼츠 후킹 구조 설계 미니 강의"], target: ["audience", "예비 크리에이터"], relationType: "targets", description: "핵심 타겟 고객군.", confidence: 0.83 },
    { source: ["customer_problem", "알고리즘 노출이 들쭉날쭉함"], target: ["expertise", "유튜브 알고리즘 대응"], relationType: "addressed_by", description: "알고리즘 신호 대응 노하우로 노출 편차를 줄임.", confidence: 0.7 },
  ],
  decisionRules: [
    { name: "쇼츠 후킹 3초 우선", condition: "쇼츠 초반 이탈률이 높음", action: "첫 3초 안에 결과 또는 질문을 제시해 시선을 붙잡음", reason: "3초 안에 후킹하지 못하면 이후 내용은 노출되지 않음", category: "engagement", weight: 0.85, confidence: 0.8 },
    { name: "구독 유도 CTA 배치", condition: "조회수 대비 구독 전환이 낮음", action: "영상 중반이 아닌 마지막 결과 장면 직후에 구독 CTA를 배치", reason: "결과를 확인한 직후가 행동 유도 반응이 가장 높음", category: "conversion", weight: 0.78, confidence: 0.72 },
    { name: "소재 반복 방지", condition: "최근 5개 영상과 주제가 겹침", action: "이전에 다룬 소재와 다른 각도의 하위 주제를 우선 추천", reason: "반복 소재는 기존 구독자의 이탈을 유발할 수 있음", category: "content_strategy", weight: 0.7, confidence: 0.68 },
  ],
  brandProfile: {
    coreMessage: "5분이면 오늘부터 바로 실천할 수 있는 자기계발 루틴을 알려드립니다.",
    tone: ["친근함", "빠른 템포", "실천 지향"],
    preferredExpressions: ["오늘부터 바로", "3초 안에", "실제로 해보니"],
    prohibitedExpressions: ["무조건 성공", "100% 효과", "과장된 수치"],
    targetAudiences: ["예비 크리에이터", "부업 크리에이터", "소상공인 채널 운영자"],
    persuasionStructure: ["후킹 질문", "문제 공감", "3초 해결책 제시", "결과 장면", "구독 유도"],
    expertiseAreas: ["쇼츠 후킹 구조 설계", "유튜브 알고리즘 대응", "숏폼 편집·자막 제작"],
  },
  preferenceWeights: { clarity: 1.1, authority: 0.9, purchaseLink: 0.85, brandFit: 1.0, novelty: 1.15, empathy: 1.0 },
  campaign: {
    name: "쇼츠 후킹 강의 구독 전환 캠페인",
    goal: "inquiries",
    audience: "예비 크리에이터, 부업 크리에이터",
    platforms: ["youtube_shorts", "instagram", "threads"],
  },
  strategyOptions: [
    {
      strategy_type: "문제 진단형",
      title: "\"조회수는 잘 나오는데 구독이 안 늘어난다면\"",
      summary: "조회수와 구독 전환이 왜 다른 지표인지 짚어주고, 원인별 해결 방향을 제시하는 진단형 콘텐츠.",
      target_problem: "조회수는 나오는데 구독 전환이 안 됨",
      core_message: "조회수와 구독은 다른 게임입니다. 원인을 알면 전환은 따라옵니다.",
      content_direction: "흔한 착각 → 실제 원인 → 3초 후킹 구조 해결책 순으로 전개",
      funnel_step: "consideration",
      feature_scores: { clarity: 88, authority: 72, purchaseLink: 58, brandFit: 82, novelty: 66, empathy: 90 },
      base_score: 83, preference_score: 87, evidence_score: 79,
      reasoning: "크리에이터의 실제 고민과 맞닿아 있어 공감·명확성 점수가 높음.",
      selected: true,
    },
    {
      strategy_type: "성공 사례형",
      title: "구독자 0명에서 시작한 5분 루틴 채널 성장기",
      summary: "실제 채널 성장 과정을 Before/After 수치로 전달하는 스토리형 콘텐츠.",
      target_problem: "매일 업로드 소재가 금방 고갈됨",
      core_message: "꾸준함보다 구조가 먼저입니다.",
      content_direction: "초기 실패 → 구조 변경 → 성장 수치 순으로 전개",
      funnel_step: "consideration",
      feature_scores: { clarity: 76, authority: 84, purchaseLink: 68, brandFit: 77, novelty: 60, empathy: 74 },
      base_score: 77, preference_score: 79, evidence_score: 83,
      reasoning: "구체적 성장 수치로 신뢰도가 높으나 후킹형 대비 공감도는 낮음.",
      selected: false,
    },
    {
      strategy_type: "전문지식형",
      title: "유튜브 알고리즘, 쇼츠는 어떻게 다를까",
      summary: "쇼츠 알고리즘의 작동 원리를 크리에이터 시각에서 설명하는 콘텐츠.",
      target_problem: "알고리즘 노출이 들쭉날쭉함",
      core_message: "노출은 운이 아니라 신호 설계의 결과입니다.",
      content_direction: "개념 설명 → 실제 사례 → 적용 팁 순으로 전개",
      funnel_step: "awareness",
      feature_scores: { clarity: 79, authority: 91, purchaseLink: 52, brandFit: 74, novelty: 57, empathy: 58 },
      base_score: 74, preference_score: 69, evidence_score: 86,
      reasoning: "전문성은 높지만 구매 연결성이 낮아 최종 순위는 중간.",
      selected: false,
    },
    {
      strategy_type: "반론 해결형",
      title: "쇼츠는 금방 잊혀진다는 오해, 진짜일까?",
      summary: "숏폼 휘발성에 대한 우려를 정면으로 다루고 채널 자산화 방법을 제시.",
      target_problem: "쇼츠는 금방 잊혀질 콘텐츠라는 인식",
      core_message: "쌓이는 구조로 만들면 쇼츠도 채널 자산이 됩니다.",
      content_direction: "우려 제시 → 실제 데이터 → 자산화 구조 제안",
      funnel_step: "decision",
      feature_scores: { clarity: 77, authority: 78, purchaseLink: 63, brandFit: 71, novelty: 61, empathy: 69 },
      base_score: 72, preference_score: 67, evidence_score: 74,
      reasoning: "결정 단계에는 유효하나 전반적 점수는 가장 낮음.",
      selected: false,
    },
  ],
  contentProjectTitle: "\"조회수는 잘 나오는데 구독이 안 늘어난다면\" 콘텐츠 제작",
  contentOutputs: [
    {
      platform: "youtube_shorts",
      title: "조회수는 잘 나오는데 구독이 안 늘어나는 이유 (15초 설명)",
      hook: "조회수는 잘 나오는데 구독은 그대로다? 영상을 더 만들기 전에 이것부터 확인하세요.",
      body: "0-3초: '조회수는 잘 나오는데 구독이 안 늘어난다면?'\n4-9초: 조회수는 관심, 구독은 신뢰입니다. 다른 지표예요.\n10-15초: 첫 3초 후킹 구조부터 다시 설계해보세요.",
      callToAction: "프로필 링크에서 후킹 구조 미니 강의 확인하기",
      hashtags: ["#유튜브쇼츠", "#쇼츠크리에이터", "#후킹구조"],
      seoKeywords: ["쇼츠 구독 전환", "유튜브 후킹"],
    },
    {
      platform: "instagram",
      title: "조회수 vs 구독, 다른 게임입니다",
      hook: "이 릴스, 저장하지 말고 지금 바로 읽어보세요.",
      body: "✔️ 조회수는 잘 나오는데 구독은 그대로다\n✔️ 매일 올리는데 채널이 안 커진다\n\n조회수는 '관심', 구독은 '신뢰'예요. 첫 3초 후킹 구조부터 다시 봐야 합니다.",
      callToAction: "프로필 링크에서 무료로 후킹 구조 체크리스트 받기",
      hashtags: ["#크리에이터", "#쇼츠제작", "#콘텐츠전략"],
      seoKeywords: ["쇼츠 후킹", "구독 전환율"],
    },
    {
      platform: "threads",
      title: "쇼츠 구독 전환이 안 되는 3가지 이유",
      hook: "쇼츠 100개 넘게 만들면서 알게 된 것.",
      body: "1. 첫 3초에 결과를 안 보여줌\n2. CTA 타이밍이 너무 이름\n3. 채널 컨셉이 매번 바뀜\n\n이 세 가지만 고쳐도 구독 전환이 눈에 띄게 달라집니다.",
      callToAction: "다음 스레드에서 자세한 구조 공유할게요",
      hashtags: ["#숏폼", "#유튜브운영"],
      seoKeywords: ["쇼츠 운영 노하우"],
    },
  ],
  performance: [
    { views: 18400, performanceScore: 76.2 },
    { views: 24100, performanceScore: 81.5 },
    { views: 31200, performanceScore: 88.3 },
  ],
  performanceAnalysis: {
    whatWorked: [
      "첫 3초 안에 결과·질문을 제시한 후킹 구조 쇼츠의 완주율이 평균보다 높았습니다.",
      "결과 장면 직후에 배치한 구독 유도 CTA의 반응이 좋았습니다.",
    ],
    whatUnderperformed: ["전문지식형 콘텐츠는 조회수 대비 구독 전환이 낮았습니다."],
    viewsVsPurchaseGap:
      "조회수는 꾸준히 늘고 있지만 미니 강의 문의 전환은 아직 낮은 편입니다. 후킹·구조화 콘텐츠가 문의 전환에 더 효과적이었습니다.",
    keepElements: ["3초 후킹 질문", "결과 장면 직후 CTA 배치"],
    reviseElements: ["전문지식형 콘텐츠의 초반 전개 속도"],
    nextContentSuggestions: [
      "구독자를 실제 팬으로 전환하는 후속 시리즈 기획",
      "소재 뱅크를 활용한 반복 가능한 포맷 제작",
    ],
  },
  weightLearning: { column: "novelty_weight", label: "새로움", before: 1.0, after: 1.15 },
};

// ---------------------------------------------------------------------------
// 페르소나 2: 블로거
// ---------------------------------------------------------------------------

const BLOGGER: PersonaSeed = {
  key: "blogger",
  orgName: "콘텐츠라이프 블로그",
  industry: "네이버 블로그 콘텐츠 제작 및 체험단 운영",
  description:
    "시제품 예시 데이터입니다. 네이버 블로그를 운영하며 체험단·협찬을 병행하는 블로거 워크스페이스로, 방문자 대비 협찬 문의 전환이 낮은 문제를 AI 분석으로 개선하는 흐름을 보여줍니다.",
  note: "시제품 예시 데이터입니다.",
  companyText:
    "콘텐츠라이프 블로그는 육아·생활용품 후기를 주로 다루는 네이버 블로그입니다. " +
    "일 방문자는 꾸준히 늘고 있지만 브랜드 협찬 문의로 이어지는 비율이 낮고, 상위노출이 유지되지 않아 " +
    "매번 새로운 키워드를 찾는 데 시간이 많이 듭니다. 네이버 SEO와 체험단 후기 작성 경험을 바탕으로 " +
    "최근에는 블로그 수익화를 원하는 초보 블로거를 위한 글쓰기 강의도 함께 운영하고 있습니다.",
  chunkContents: [
    "콘텐츠라이프 블로그는 육아·생활용품 후기를 주로 다루는 네이버 블로그입니다. " +
      "일 방문자는 꾸준히 늘고 있지만 브랜드 협찬 문의로 이어지는 비율이 낮은 상태입니다.",
    "상위노출이 유지되지 않아 매번 새로운 키워드를 찾는 데 시간이 많이 들며, 네이버 SEO와 체험단 후기 작성 " +
      "경험을 바탕으로 블로그 수익화를 원하는 초보 블로거를 위한 글쓰기 강의도 함께 운영하고 있습니다.",
  ],
  entities: [
    { entityType: "product", name: "네이버 블로그 SEO 글쓰기 강의", summary: "키워드 리서치부터 상위노출 구조까지 다루는 블로그 수익화 실전 강의.", confidence: 0.89 },
    { entityType: "audience", name: "블로그 초보 운영자", summary: "블로그를 막 시작해 방문자와 협찬 문의를 늘리고 싶은 사람.", confidence: 0.85 },
    { entityType: "audience", name: "체험단 활동가", summary: "체험단·협찬 후기를 꾸준히 작성해 부수입을 만들고 싶은 사람.", confidence: 0.8 },
    { entityType: "audience", name: "육아맘 블로거", summary: "육아 병행하며 블로그로 수익화를 시도하는 주부.", confidence: 0.77 },
    { entityType: "customer_problem", name: "방문자는 느는데 협찬 문의가 없음", summary: "방문자 수 증가가 실제 브랜드 협찬 제안으로 연결되지 않는 문제.", confidence: 0.9 },
    { entityType: "customer_problem", name: "상위노출이 자꾸 밀림", summary: "어렵게 상위노출된 글도 며칠 지나면 순위가 밀려 방문자가 줄어듦.", confidence: 0.84 },
    { entityType: "customer_problem", name: "매번 새 소재를 찾기 힘듦", summary: "키워드와 후기 소재를 계속 새로 발굴해야 하는 부담.", confidence: 0.78 },
    { entityType: "expertise", name: "네이버 SEO", summary: "키워드 검색량, 문서 구조, 이미지 최적화 등 네이버 상위노출 실무 지식.", confidence: 0.87 },
    { entityType: "expertise", name: "키워드 리서치", summary: "경쟁도 낮고 전환 가능성 높은 세부 키워드를 찾는 노하우.", confidence: 0.82 },
    { entityType: "expertise", name: "체험단 후기 작성", summary: "협찬 제품의 신뢰도를 높이는 후기 구조와 사진 배치 노하우.", confidence: 0.8 },
    { entityType: "desire", name: "전문 블로거로 수익화하고 싶음", summary: "취미 블로그를 넘어 안정적인 협찬 수익 구조를 만들고 싶어함.", confidence: 0.79 },
    { entityType: "desire", name: "글쓰는 시간을 줄이고 싶음", summary: "매번 새 소재를 찾고 글을 쓰는 데 드는 시간을 줄이고 싶어함.", confidence: 0.73 },
    { entityType: "objection", name: "블로그는 이제 한물갔다는 인식", summary: "인스타·쇼츠에 밀려 블로그 효과가 예전만 못하다는 우려.", confidence: 0.66 },
    { entityType: "solution", name: "SEO 최적화 글감·구조 자동 추천", summary: "검색 의도에 맞는 키워드와 글 구조를 자동으로 추천하는 방법.", confidence: 0.84 },
    { entityType: "solution", name: "신뢰 형성형 후기 템플릿", summary: "협찬 문의로 이어지는 신뢰 형성 후기 구조 템플릿.", confidence: 0.78 },
    { entityType: "brand_expression", name: "직접 써보고 솔직하게 비교합니다", summary: "과장 없이 실사용 경험 중심으로 전달하는 브랜드 톤.", confidence: 0.75 },
  ],
  relations: [
    { source: ["customer_problem", "방문자는 느는데 협찬 문의가 없음"], target: ["solution", "신뢰 형성형 후기 템플릿"], relationType: "solved_by", description: "신뢰 형성 구조의 후기가 협찬 문의 전환을 높임.", confidence: 0.81 },
    { source: ["customer_problem", "상위노출이 자꾸 밀림"], target: ["solution", "SEO 최적화 글감·구조 자동 추천"], relationType: "solved_by", description: "구조화된 SEO 글쓰기로 상위노출 유지력을 높임.", confidence: 0.79 },
    { source: ["desire", "전문 블로거로 수익화하고 싶음"], target: ["product", "네이버 블로그 SEO 글쓰기 강의"], relationType: "fulfilled_by", description: "수익화 니즈를 강의 상품이 충족.", confidence: 0.76 },
    { source: ["product", "네이버 블로그 SEO 글쓰기 강의"], target: ["audience", "블로그 초보 운영자"], relationType: "targets", description: "핵심 타겟 고객군.", confidence: 0.82 },
    { source: ["customer_problem", "매번 새 소재를 찾기 힘듦"], target: ["expertise", "키워드 리서치"], relationType: "addressed_by", description: "체계적 키워드 리서치로 소재 고갈 문제를 완화.", confidence: 0.7 },
  ],
  decisionRules: [
    { name: "협찬 전환 후기 구조 우선", condition: "방문자 대비 협찬 문의 전환율이 낮음", action: "제품 나열형 후기보다 사용 전/후 비교와 신뢰 근거 중심 후기 비중 확대", reason: "구매/협찬 의사결정자는 비교 근거를 우선 확인함", category: "trust_building", weight: 0.8, confidence: 0.74 },
    { name: "롱테일 키워드 우선 노출", condition: "대표 키워드 경쟁이 심해 상위노출이 밀림", action: "검색량은 적지만 경쟁도 낮은 롱테일 키워드를 제목·소제목에 우선 배치", reason: "롱테일 키워드는 상위노출 유지 기간이 더 김", category: "content_strategy", weight: 0.75, confidence: 0.7 },
    { name: "발행 초반 체류시간 확보", condition: "글 초반 이탈률이 높음", action: "첫 문단에 결론 요약과 목차를 배치해 체류시간을 확보", reason: "초반 이탈이 많으면 문서 품질 지수에 불리하게 작용함", category: "engagement", weight: 0.72, confidence: 0.66 },
  ],
  brandProfile: {
    coreMessage: "직접 써보고 비교한 솔직한 후기로 믿을 수 있는 선택을 도와드립니다.",
    tone: ["솔직함", "꼼꼼함", "친근함"],
    preferredExpressions: ["직접 써본 결과", "비교해보니", "실제로는"],
    prohibitedExpressions: ["무조건 최고", "완벽한 제품", "과장된 후기"],
    targetAudiences: ["블로그 초보 운영자", "체험단 활동가", "육아맘 블로거"],
    persuasionStructure: ["문제 제시", "직접 사용 경험", "비교 근거", "신뢰 요소", "행동 유도"],
    expertiseAreas: ["네이버 SEO", "키워드 리서치", "체험단 후기 작성"],
  },
  preferenceWeights: { clarity: 1.05, authority: 1.1, purchaseLink: 0.95, brandFit: 1.0, novelty: 0.85, empathy: 1.05 },
  campaign: {
    name: "블로그 SEO 강의 협찬 문의 전환 캠페인",
    goal: "consultations",
    audience: "블로그 초보 운영자, 체험단 활동가",
    platforms: ["naver_blog", "instagram", "newsletter"],
  },
  strategyOptions: [
    {
      strategy_type: "문제 진단형",
      title: "\"방문자는 느는데 협찬 문의가 없다면\" 진단 콘텐츠",
      summary: "방문자 증가와 협찬 전환이 왜 별개인지 짚어주고 해결 방향을 제시.",
      target_problem: "방문자는 느는데 협찬 문의가 없음",
      core_message: "방문자와 신뢰는 다른 지표입니다. 후기 구조를 바꾸면 문의가 달라집니다.",
      content_direction: "흔한 착각 → 실제 원인 → 신뢰 형성 후기 구조 제안",
      funnel_step: "consideration",
      feature_scores: { clarity: 86, authority: 74, purchaseLink: 62, brandFit: 81, novelty: 63, empathy: 88 },
      base_score: 81, preference_score: 86, evidence_score: 79,
      reasoning: "블로거의 실제 고민과 맞닿아 있어 공감·명확성 점수가 높음.",
      selected: true,
    },
    {
      strategy_type: "성공 사례형",
      title: "방문자 500명대에서 협찬 문의를 늘린 블로그 구조 변경기",
      summary: "실제 방문자·문의 수치 변화를 Before/After로 전달하는 사례형 콘텐츠.",
      target_problem: "상위노출이 자꾸 밀림",
      core_message: "노출은 꾸준함이 아니라 구조가 만듭니다.",
      content_direction: "초기 정체 → 구조 변경 → 노출 유지 수치 순으로 전개",
      funnel_step: "consideration",
      feature_scores: { clarity: 75, authority: 85, purchaseLink: 66, brandFit: 76, novelty: 58, empathy: 73 },
      base_score: 76, preference_score: 78, evidence_score: 84,
      reasoning: "구체적 수치로 신뢰도가 높으나 진단형 대비 공감도는 낮음.",
      selected: false,
    },
    {
      strategy_type: "전문지식형",
      title: "네이버 상위노출, 알고리즘이 정말 좋아하는 글은?",
      summary: "네이버 SEO의 핵심 원리를 블로거 시각에서 설명하는 콘텐츠.",
      target_problem: "매번 새 소재를 찾기 힘듦",
      core_message: "노출은 감이 아니라 구조 설계의 결과입니다.",
      content_direction: "개념 설명 → 실제 사례 → 적용 체크리스트",
      funnel_step: "awareness",
      feature_scores: { clarity: 78, authority: 90, purchaseLink: 54, brandFit: 73, novelty: 56, empathy: 59 },
      base_score: 73, preference_score: 68, evidence_score: 87,
      reasoning: "전문성은 높지만 구매 연결성이 낮아 최종 순위는 중간.",
      selected: false,
    },
    {
      strategy_type: "반론 해결형",
      title: "블로그는 한물갔다는 말, 정말 사실일까?",
      summary: "블로그 효과 저하 우려를 정면으로 다루고 실제 데이터로 반박.",
      target_problem: "블로그는 이제 한물갔다는 인식",
      core_message: "검색은 여전히 구매 직전 가장 많이 하는 행동입니다.",
      content_direction: "우려 제시 → 실제 데이터 → 여전히 유효한 이유 제시",
      funnel_step: "decision",
      feature_scores: { clarity: 76, authority: 79, purchaseLink: 61, brandFit: 70, novelty: 60, empathy: 68 },
      base_score: 71, preference_score: 66, evidence_score: 73,
      reasoning: "결정 단계에는 유효하나 전반적 점수는 가장 낮음.",
      selected: false,
    },
  ],
  contentProjectTitle: "\"방문자는 느는데 협찬 문의가 없다면\" 콘텐츠 제작",
  contentOutputs: [
    {
      platform: "naver_blog",
      title: "방문자는 느는데 협찬 문의는 왜 없을까요? (블로그 후기 구조 점검)",
      hook: "매일 글을 쓰는데 정작 협찬 문의는 늘지 않아 답답하셨다면, 원인은 글의 양이 아닐 수 있습니다.",
      body:
        "많은 블로거분들이 '글을 더 많이 쓰면 협찬도 늘겠지'라고 생각하지만, 실제로는 방문자 수와 " +
        "협찬 전환은 다른 문제인 경우가 많습니다.\n\n방문자가 많은 글은 '검색 노출'에 성공한 것이고, " +
        "협찬 문의로 이어지는 글은 '브랜드가 신뢰할 수 있는 후기 구조'를 갖춘 것입니다. " +
        "이 둘을 구분하지 않으면 아무리 글을 늘려도 문의는 제자리일 수 있습니다.\n\n" +
        "네이버 블로그 SEO 글쓰기 강의에서는 키워드 리서치부터 신뢰 형성 후기 구조까지 " +
        "하나의 흐름으로 정리하는 방법을 알려드립니다.",
      callToAction: "지금 무료 후기 구조 체크리스트를 받아보세요.",
      hashtags: ["#블로그마케팅", "#네이버SEO", "#체험단후기", "#블로그수익화"],
      seoKeywords: ["네이버 블로그 SEO", "협찬 문의 늘리기", "체험단 후기 작성법"],
    },
    {
      platform: "instagram",
      title: "방문자 vs 협찬 문의, 다른 게임입니다",
      hook: "이 게시물, 저장하지 말고 지금 바로 읽어보세요.",
      body: "✔️ 방문자는 느는데 협찬 문의는 없다\n✔️ 매일 글을 쓰는데 수익은 그대로다\n\n방문자는 '검색 노출', 협찬 문의는 '신뢰'입니다. 후기 구조부터 다시 점검해보세요.",
      callToAction: "프로필 링크에서 무료로 후기 구조 진단받기",
      hashtags: ["#블로거", "#체험단", "#콘텐츠전략"],
      seoKeywords: ["블로그 협찬 늘리기", "체험단 신청"],
    },
    {
      platform: "newsletter",
      title: "협찬 문의가 늘지 않는 블로거를 위한 3가지 점검 포인트",
      hook: "방문자는 느는데 협찬 문의가 정체되어 있다면, 아래 3가지부터 점검해보세요.",
      body:
        "1. 후기에 비교 근거가 있는가\n2. 첫 문단에 결론이 요약되어 있는가\n3. 키워드가 검색 의도와 맞는가\n\n" +
        "이 세 가지만 점검해도 협찬 문의 전환율이 눈에 띄게 달라집니다.",
      callToAction: "다음 뉴스레터에서 후기 템플릿을 공유해드릴게요.",
      hashtags: ["#블로그운영", "#콘텐츠마케팅"],
      seoKeywords: ["블로그 운영 노하우", "협찬 후기 템플릿"],
    },
  ],
  performance: [
    { views: 5200, performanceScore: 69.4 },
    { views: 6800, performanceScore: 74.8 },
    { views: 9100, performanceScore: 82.6 },
  ],
  performanceAnalysis: {
    whatWorked: [
      "사용 전/후 비교 근거를 담은 후기의 협찬 문의 전환이 다른 글보다 높았습니다.",
      "첫 문단에 결론을 요약한 글의 체류시간과 상위노출 유지 기간이 더 길었습니다.",
    ],
    whatUnderperformed: ["단순 정보 나열형 글은 방문자는 늘어도 문의로 이어지지 않았습니다."],
    viewsVsPurchaseGap:
      "방문자 수는 꾸준히 늘고 있지만 협찬 문의 전환은 아직 낮은 편입니다. 비교 근거가 있는 후기가 문의 전환에 더 효과적이었습니다.",
    keepElements: ["사용 전/후 비교 구조", "첫 문단 결론 요약"],
    reviseElements: ["단순 정보 나열형 글의 후반부 구성"],
    nextContentSuggestions: [
      "재구매·재협찬으로 이어지는 후속 후기 시리즈 기획",
      "롱테일 키워드를 활용한 상위노출 유지 콘텐츠 확대",
    ],
  },
  weightLearning: { column: "authority_weight", label: "전문성", before: 1.0, after: 1.1 },
};

// ---------------------------------------------------------------------------
// 페르소나 3: 제품 판매 셀러
// ---------------------------------------------------------------------------

const SELLER: PersonaSeed = {
  key: "seller",
  orgName: "그린라이프 스토어",
  industry: "스마트스토어 친환경 생활용품 판매",
  description:
    "시제품 예시 데이터입니다. 스마트스토어에서 친환경 생활용품을 판매하는 셀러 워크스페이스로, 상세페이지 체류시간 대비 구매 전환이 낮은 문제를 AI 분석으로 개선하는 흐름을 보여줍니다.",
  note: "시제품 예시 데이터입니다.",
  companyText:
    "그린라이프 스토어는 스마트스토어에서 다회용 친환경 주방용품을 판매하는 온라인 셀러입니다. " +
    "대표 상품은 '다회용 실리콘 수세미 세트'이며, 상세페이지 체류시간은 긴 편이지만 실제 구매 전환은 " +
    "낮고 리뷰 수가 부족해 신뢰 형성에 어려움을 겪고 있습니다. 재구매율도 낮아 리뷰와 재구매가 " +
    "선순환되는 구조를 만드는 것이 목표이며, 상세페이지 카피라이팅과 리뷰 마케팅 경험을 쌓아왔습니다.",
  chunkContents: [
    "그린라이프 스토어는 스마트스토어에서 다회용 친환경 주방용품을 판매하는 온라인 셀러입니다. " +
      "대표 상품은 '다회용 실리콘 수세미 세트'이며, 상세페이지 체류시간은 긴 편이지만 실제 구매 전환은 낮습니다.",
    "리뷰 수가 부족해 신뢰 형성에 어려움을 겪고 있고 재구매율도 낮아, 리뷰와 재구매가 선순환되는 구조를 " +
      "만드는 것이 목표이며 상세페이지 카피라이팅과 리뷰 마케팅 경험을 쌓아왔습니다.",
  ],
  entities: [
    { entityType: "product", name: "다회용 실리콘 수세미 세트", summary: "일회용 수세미를 대체하는 친환경 다회용 실리콘 수세미 3종 세트.", confidence: 0.91 },
    { entityType: "audience", name: "친환경 소비 관심 30대 주부", summary: "환경을 고려한 생활용품 구매에 관심이 높은 30대 주부.", confidence: 0.86 },
    { entityType: "audience", name: "자취생", summary: "1인 가구로 위생과 편의성을 함께 고려하는 자취생.", confidence: 0.79 },
    { entityType: "customer_problem", name: "상세페이지 체류시간은 긴데 구매 전환이 낮음", summary: "상품을 오래 살펴보지만 실제 구매로 이어지지 않는 문제.", confidence: 0.9 },
    { entityType: "customer_problem", name: "리뷰가 부족해 신뢰 형성이 안 됨", summary: "리뷰 수와 사진이 적어 구매 결정 단계에서 신뢰를 얻기 어려움.", confidence: 0.85 },
    { entityType: "customer_problem", name: "재구매율이 낮음", summary: "첫 구매 이후 재구매로 이어지는 비율이 낮음.", confidence: 0.78 },
    { entityType: "expertise", name: "상세페이지 카피라이팅", summary: "구매 전환을 높이는 상세페이지 문구 구조 설계 경험.", confidence: 0.86 },
    { entityType: "expertise", name: "리뷰 마케팅", summary: "구매 후 리뷰 작성을 유도하고 리뷰를 다시 마케팅에 활용하는 노하우.", confidence: 0.81 },
    { entityType: "desire", name: "리뷰와 재구매가 선순환되는 구조를 원함", summary: "리뷰가 신규 구매를 부르고, 재구매가 다시 리뷰로 이어지는 구조를 만들고 싶어함.", confidence: 0.8 },
    { entityType: "desire", name: "가격 저항 없이 가치를 설득하고 싶음", summary: "친환경 제품의 가격을 낮추지 않고도 가치를 설득하고 싶어함.", confidence: 0.74 },
    { entityType: "objection", name: "친환경 제품은 비쌀 것 같다는 인식", summary: "친환경 제품은 일반 제품보다 비싸고 성능이 떨어질 것이라는 우려.", confidence: 0.7 },
    { entityType: "objection", name: "이미 비슷한 제품을 써봤지만 실망함", summary: "과거 다회용 제품 구매 실패 경험으로 인한 재구매 망설임.", confidence: 0.65 },
    { entityType: "solution", name: "사용 전/후 비교 중심 상세페이지", summary: "일회용 대비 사용감·경제성을 비교로 보여주는 상세페이지 구조.", confidence: 0.83 },
    { entityType: "solution", name: "리뷰 유도 후기 리워드 구조", summary: "구매 후 리뷰 작성을 자연스럽게 유도하는 리워드·타이밍 설계.", confidence: 0.77 },
    { entityType: "brand_expression", name: "숫자로 경제성을 보여드립니다", summary: "막연한 친환경 주장 대신 비용 절감 수치로 설득하는 브랜드 화법.", confidence: 0.76 },
  ],
  relations: [
    { source: ["customer_problem", "상세페이지 체류시간은 긴데 구매 전환이 낮음"], target: ["solution", "사용 전/후 비교 중심 상세페이지"], relationType: "solved_by", description: "비교 구조로 망설임을 줄이고 전환을 높임.", confidence: 0.8 },
    { source: ["customer_problem", "리뷰가 부족해 신뢰 형성이 안 됨"], target: ["solution", "리뷰 유도 후기 리워드 구조"], relationType: "solved_by", description: "리워드 설계로 초기 리뷰 수를 빠르게 확보.", confidence: 0.77 },
    { source: ["desire", "리뷰와 재구매가 선순환되는 구조를 원함"], target: ["product", "다회용 실리콘 수세미 세트"], relationType: "fulfilled_by", description: "재구매 유도 상품 설계가 니즈를 충족.", confidence: 0.75 },
    { source: ["product", "다회용 실리콘 수세미 세트"], target: ["audience", "친환경 소비 관심 30대 주부"], relationType: "targets", description: "핵심 타겟 고객군.", confidence: 0.84 },
    { source: ["objection", "친환경 제품은 비쌀 것 같다는 인식"], target: ["brand_expression", "숫자로 경제성을 보여드립니다"], relationType: "addressed_by", description: "비용 절감 수치 제시로 가격 저항을 낮춤.", confidence: 0.69 },
  ],
  decisionRules: [
    { name: "구매 전환 비교 콘텐츠 우선", condition: "상세페이지 체류시간 대비 구매 전환이 낮음", action: "제품 기능 나열보다 일회용 대비 사용 전/후 비교 콘텐츠 비중 확대", reason: "체류는 하지만 확신이 없어 이탈하는 경우가 많음", category: "conversion", weight: 0.82, confidence: 0.75 },
    { name: "초기 리뷰 확보 우선", condition: "리뷰 수가 10건 미만으로 신뢰 신호가 부족함", action: "구매 후 7일 시점에 리뷰 작성 리워드 안내를 발송", reason: "사용 경험이 쌓인 시점의 리뷰 요청이 응답률이 높음", category: "trust_building", weight: 0.78, confidence: 0.72 },
    { name: "재구매 유도 타이밍", condition: "제품 소진 예상 시점이 다가옴", action: "소진 예상 시점 직전에 재구매 알림과 소량 할인 쿠폰을 발송", reason: "소진 직전이 재구매 의사결정이 가장 높은 시점임", category: "retention", weight: 0.74, confidence: 0.68 },
  ],
  brandProfile: {
    coreMessage: "일회용을 줄이면서도 숫자로 확인되는 경제성까지 챙길 수 있습니다.",
    tone: ["신뢰감", "실용적", "차분함"],
    preferredExpressions: ["숫자로 확인해보면", "일회용 대비", "실사용 후기"],
    prohibitedExpressions: ["무조건 친환경", "100% 안전", "과장된 절감 수치"],
    targetAudiences: ["친환경 소비 관심 30대 주부", "자취생"],
    persuasionStructure: ["문제 제시", "비교 데이터", "신뢰 요소(리뷰)", "경제성 근거", "행동 유도"],
    expertiseAreas: ["상세페이지 카피라이팅", "리뷰 마케팅"],
  },
  preferenceWeights: { clarity: 1.0, authority: 1.05, purchaseLink: 1.2, brandFit: 1.0, novelty: 0.8, empathy: 0.95 },
  campaign: {
    name: "친환경 수세미 세트 구매 전환 캠페인",
    goal: "purchases",
    audience: "친환경 소비 관심 30대 주부, 자취생",
    platforms: ["naver_blog", "instagram", "landing_page"],
  },
  strategyOptions: [
    {
      strategy_type: "문제 진단형",
      title: "\"상세페이지는 오래 보는데 구매로 안 이어진다면\"",
      summary: "체류시간과 구매 전환이 왜 다른지 짚어주고 신뢰 요소 보완 방향을 제시.",
      target_problem: "상세페이지 체류시간은 긴데 구매 전환이 낮음",
      core_message: "오래 본다는 건 관심이 있다는 뜻입니다. 마지막 확신만 채워주면 됩니다.",
      content_direction: "흔한 착각 → 실제 원인 → 비교 데이터로 확신 제공",
      funnel_step: "decision",
      feature_scores: { clarity: 85, authority: 75, purchaseLink: 88, brandFit: 80, novelty: 60, empathy: 78 },
      base_score: 82, preference_score: 85, evidence_score: 80,
      reasoning: "구매 직전 확신을 채워주는 구조라 구매연결(purchaseLink) 점수가 특히 높음.",
      selected: true,
    },
    {
      strategy_type: "성공 사례형",
      title: "리뷰 10건에서 100건까지, 재구매율을 바꾼 방법",
      summary: "실제 리뷰·재구매율 변화를 Before/After 수치로 전달.",
      target_problem: "리뷰가 부족해 신뢰 형성이 안 됨",
      core_message: "리뷰는 쌓이는 게 아니라 설계하는 것입니다.",
      content_direction: "초기 리뷰 부족 → 리워드 설계 → 재구매율 변화 순으로 전개",
      funnel_step: "consideration",
      feature_scores: { clarity: 74, authority: 83, purchaseLink: 70, brandFit: 76, novelty: 59, empathy: 71 },
      base_score: 75, preference_score: 77, evidence_score: 82,
      reasoning: "구체적 수치로 신뢰도가 높으나 진단형 대비 구매 직결성은 낮음.",
      selected: false,
    },
    {
      strategy_type: "전문지식형",
      title: "다회용 주방용품, 정말 경제적일까? 숫자로 계산해봤습니다",
      summary: "일회용 대비 비용 절감을 수치로 설명하는 전문가 시각 콘텐츠.",
      target_problem: "친환경 제품은 비쌀 것 같다는 인식",
      core_message: "친환경은 감성이 아니라 계산의 문제입니다.",
      content_direction: "비용 계산 → 사용 기간 비교 → 절감 수치 제시",
      funnel_step: "awareness",
      feature_scores: { clarity: 80, authority: 89, purchaseLink: 65, brandFit: 78, novelty: 55, empathy: 56 },
      base_score: 75, preference_score: 70, evidence_score: 88,
      reasoning: "전문성과 근거는 높지만 공감도가 낮아 최종 순위는 중간.",
      selected: false,
    },
    {
      strategy_type: "반론 해결형",
      title: "다회용 제품, 예전에 써봤는데 실망했다면",
      summary: "과거 실패 경험에 대한 반론을 정면으로 다루고 개선점을 제시.",
      target_problem: "이미 비슷한 제품을 써봤지만 실망함",
      core_message: "예전 제품과 다른 이유를 데이터로 보여드립니다.",
      content_direction: "우려 제시 → 기존 제품과의 차이 → 실사용 근거 제시",
      funnel_step: "decision",
      feature_scores: { clarity: 76, authority: 77, purchaseLink: 74, brandFit: 72, novelty: 58, empathy: 67 },
      base_score: 72, preference_score: 68, evidence_score: 75,
      reasoning: "결정 단계에는 유효하나 전반적 점수는 가장 낮음.",
      selected: false,
    },
  ],
  contentProjectTitle: "\"상세페이지는 오래 보는데 구매로 안 이어진다면\" 콘텐츠 제작",
  contentOutputs: [
    {
      platform: "landing_page",
      title: "다회용 실리콘 수세미, 일회용 대비 얼마나 절약될까요?",
      hook: "상세페이지를 오래 살펴보셨다면, 이제 확신만 남았습니다.",
      body:
        "일회용 수세미는 한 달에 평균 4개를 사용합니다. 다회용 실리콘 수세미 1세트는 6개월 이상 " +
        "사용 가능해, 같은 기간 기준으로 계산하면 약 63% 비용을 절감할 수 있습니다.\n\n" +
        "위생 걱정도 줄었습니다. 실리콘 소재는 끓는 물 소독이 가능해 세균 번식 걱정 없이 오래 쓸 수 있습니다.",
      callToAction: "지금 구매하고 첫 사용 후기를 남기면 다음 구매 시 사용할 수 있는 리뷰 쿠폰을 드립니다.",
      hashtags: ["#친환경생활", "#제로웨이스트", "#다회용수세미"],
      seoKeywords: ["다회용 수세미", "친환경 주방용품", "일회용 대체"],
    },
    {
      platform: "naver_blog",
      title: "일회용 수세미 대신 다회용을 6개월 써본 솔직한 후기",
      hook: "친환경 제품, 비싸고 별로일 거라 생각하셨다면 이 후기부터 읽어보세요.",
      body:
        "처음에는 '다회용이라고 해봤자 금방 냄새나고 지저분해지지 않을까' 걱정했습니다. " +
        "하지만 6개월간 사용해보니 끓는 물 소독만으로 위생 관리가 충분했고, 일회용 수세미를 " +
        "매달 새로 사는 비용과 비교하면 확실히 절약이 되었습니다.\n\n" +
        "리뷰를 남기신 다른 구매자분들도 '생각보다 오래 쓴다', '냄새가 안 난다'는 후기를 많이 남겨주셨습니다.",
      callToAction: "지금 구매하고 리뷰를 남기면 다음 구매 쿠폰을 드립니다.",
      hashtags: ["#친환경리뷰", "#다회용수세미", "#제로웨이스트"],
      seoKeywords: ["다회용 수세미 후기", "친환경 생활용품 추천"],
    },
    {
      platform: "instagram",
      title: "일회용 vs 다회용, 6개월 비용 비교해봤습니다",
      hook: "이 게시물, 저장하고 장보기 전에 다시 보세요.",
      body: "✔️ 일회용 수세미 6개월 비용: 약 18,000원\n✔️ 다회용 실리콘 세트 6개월 비용: 약 6,900원\n\n숫자로 보니 확실하죠? 위생도, 비용도 다회용이 이깁니다.",
      callToAction: "프로필 링크에서 지금 바로 확인하기",
      hashtags: ["#제로웨이스트", "#친환경살림", "#다회용수세미"],
      seoKeywords: ["친환경 생활용품", "다회용 수세미 가격"],
    },
  ],
  performance: [
    { views: 7300, performanceScore: 72.1 },
    { views: 9800, performanceScore: 79.4 },
    { views: 13500, performanceScore: 85.9 },
  ],
  performanceAnalysis: {
    whatWorked: [
      "일회용 대비 비용을 숫자로 비교한 콘텐츠의 구매 전환이 가장 높았습니다.",
      "실사용 후기 중심 콘텐츠가 신뢰 형성에 효과적이었습니다.",
    ],
    whatUnderperformed: ["제품 기능만 나열한 콘텐츠는 체류시간 대비 구매 전환이 낮았습니다."],
    viewsVsPurchaseGap:
      "상세페이지 체류시간은 긴 편이지만 구매 전환은 아직 낮습니다. 비교 데이터와 리뷰 근거를 제시한 콘텐츠가 구매 전환에 더 효과적이었습니다.",
    keepElements: ["일회용 대비 비용 비교", "실사용 후기 근거"],
    reviseElements: ["기능 나열형 콘텐츠의 도입부"],
    nextContentSuggestions: [
      "재구매 유도 타이밍에 맞춘 후속 콘텐츠 제작",
      "리뷰 리워드 안내를 포함한 신규 구매자 온보딩 콘텐츠",
    ],
  },
  weightLearning: { column: "purchase_link_weight", label: "구매연결", before: 1.0, after: 1.2 },
};

const PERSONAS: PersonaSeed[] = [YOUTUBER, BLOGGER, SELLER];

// ---------------------------------------------------------------------------
// 시딩 로직
// ---------------------------------------------------------------------------

async function ensureUser(email: string, password: string): Promise<string> {
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) throw new Error(`auth 사용자 목록 조회 실패: ${listError.message}`);
  const found = listData.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`계정 생성 실패(${email}): ${createError?.message}`);
  return created.user.id;
}

async function seedPersona(persona: PersonaSeed, demoUserId: string): Promise<void> {
  const p = persona.key;

  const { data: existing } = await supabase.from("organizations").select("id").eq("name", persona.orgName).limit(1).maybeSingle();
  let organizationId: string;
  let isNew: boolean;

  if (existing) {
    organizationId = existing.id;
    isNew = false;
    log(p, "조직", `기존 조직을 재사용합니다 (id=${organizationId}).`);
  } else {
    const { data: created, error } = await supabase
      .from("organizations")
      .insert({ name: persona.orgName, industry: persona.industry, description: persona.description })
      .select("id")
      .single();
    if (error || !created) throw new Error(`organizations 생성 실패: ${error?.message}`);
    organizationId = created.id;
    isNew = true;
    log(p, "조직", `새 조직을 생성했습니다 (id=${organizationId}).`);
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert({ organization_id: organizationId, user_id: demoUserId, role: "owner" }, { onConflict: "organization_id,user_id" });
  if (memberError) throw new Error(`organization_members upsert 실패: ${memberError.message}`);

  const demoMetadata: Json = { demo: true, note: persona.note };

  // 지식 엔터티 -----------------------------------------------------------
  const entityRows = persona.entities.map((e) => ({
    organization_id: organizationId,
    entity_type: e.entityType,
    name: e.name,
    summary: e.summary,
    confidence_score: e.confidence,
    metadata: demoMetadata,
  }));
  const { data: entityData, error: entityError } = await supabase
    .from("knowledge_entities")
    .upsert(entityRows, { onConflict: "organization_id,entity_type,name" })
    .select("id, entity_type, name");
  if (entityError || !entityData) throw new Error(`knowledge_entities upsert 실패: ${entityError?.message}`);
  const entityMap = new Map(entityData.map((r) => [`${r.entity_type}::${r.name}`, r.id]));
  log(p, "지식그래프", `엔터티 ${entityData.length}건 upsert.`);

  // 의사결정 규칙 -----------------------------------------------------------
  const ruleRows = persona.decisionRules.map((r) => ({
    organization_id: organizationId,
    rule_name: r.name,
    condition_text: r.condition,
    action_text: r.action,
    reason_text: r.reason,
    rule_category: r.category,
    weight: r.weight,
    confidence_score: r.confidence,
    is_active: true,
  }));
  const { error: ruleError } = await supabase.from("decision_rules").upsert(ruleRows, { onConflict: "organization_id,rule_name" });
  if (ruleError) throw new Error(`decision_rules upsert 실패: ${ruleError.message}`);
  log(p, "의사결정 규칙", `${ruleRows.length}건 upsert.`);

  // 브랜드 프로필 + 선호 가중치 ---------------------------------------------
  const { error: brandError } = await supabase.from("brand_profiles").upsert(
    {
      organization_id: organizationId,
      core_message: persona.brandProfile.coreMessage,
      tone: persona.brandProfile.tone as Json,
      preferred_expressions: persona.brandProfile.preferredExpressions as Json,
      prohibited_expressions: persona.brandProfile.prohibitedExpressions as Json,
      target_audiences: persona.brandProfile.targetAudiences as Json,
      persuasion_structure: persona.brandProfile.persuasionStructure as Json,
      expertise_areas: persona.brandProfile.expertiseAreas as Json,
    },
    { onConflict: "organization_id" }
  );
  if (brandError) throw new Error(`brand_profiles upsert 실패: ${brandError.message}`);

  const { error: weightsError } = await supabase.from("preference_weights").upsert(
    {
      organization_id: organizationId,
      clarity_weight: persona.preferenceWeights.clarity,
      authority_weight: persona.preferenceWeights.authority,
      purchase_link_weight: persona.preferenceWeights.purchaseLink,
      brand_fit_weight: persona.preferenceWeights.brandFit,
      novelty_weight: persona.preferenceWeights.novelty,
      empathy_weight: persona.preferenceWeights.empathy,
    },
    { onConflict: "organization_id" }
  );
  if (weightsError) throw new Error(`preference_weights upsert 실패: ${weightsError.message}`);
  log(p, "브랜드/가중치", "brand_profiles, preference_weights upsert 완료.");

  if (!isNew) {
    log(p, "요약", "기존 조직이라 비-idempotent 데이터(지식관계/데이터소스/캠페인/콘텐츠/성과 등)는 건너뜁니다.");
    return;
  }

  // 지식 관계 --------------------------------------------------------------
  const getEntity = (type: EntityType, name: string): string => {
    const id = entityMap.get(`${type}::${name}`);
    if (!id) throw new Error(`엔터티를 찾을 수 없습니다: ${type}::${name}`);
    return id;
  };
  const relationRows: Database["public"]["Tables"]["knowledge_relations"]["Insert"][] = persona.relations.map((r) => ({
    organization_id: organizationId,
    source_entity_id: getEntity(r.source[0], r.source[1]),
    target_entity_id: getEntity(r.target[0], r.target[1]),
    relation_type: r.relationType,
    description: r.description,
    confidence_score: r.confidence,
  }));
  const { error: relError } = await supabase.from("knowledge_relations").insert(relationRows);
  if (relError) throw new Error(`knowledge_relations 생성 실패: ${relError.message}`);

  // 데이터 소스 + 청크 + 근거 -----------------------------------------------
  const { data: dataSource, error: dsError } = await supabase
    .from("data_sources")
    .insert({
      organization_id: organizationId,
      source_type: "text",
      title: `${persona.orgName} 소개 문서`,
      original_text: persona.companyText,
      extracted_text: persona.companyText,
      status: "completed",
      processing_progress: 100,
      metadata: demoMetadata,
    })
    .select("id")
    .single();
  if (dsError || !dataSource) throw new Error(`data_sources 생성 실패: ${dsError?.message}`);

  const chunkRows: Database["public"]["Tables"]["document_chunks"]["Insert"][] = persona.chunkContents.map((content, index) => ({
    organization_id: organizationId,
    data_source_id: dataSource.id,
    chunk_index: index,
    content,
    token_count: Math.ceil(content.length / 2),
    embedding: null,
    embedding_model: null,
    embedding_dimension: null,
    metadata: demoMetadata,
  }));
  const { data: chunks, error: chunkError } = await supabase.from("document_chunks").insert(chunkRows).select("id, chunk_index");
  if (chunkError || !chunks) throw new Error(`document_chunks 생성 실패: ${chunkError?.message}`);
  const chunkIds = chunks.sort((a, b) => a.chunk_index - b.chunk_index).map((c) => c.id);

  const productEntity = persona.entities.find((e) => e.entityType === "product");
  const primaryProblem = persona.entities.find((e) => e.entityType === "customer_problem");
  const evidenceRows: Database["public"]["Tables"]["knowledge_evidence"]["Insert"][] = [];
  if (productEntity) {
    evidenceRows.push({
      organization_id: organizationId,
      entity_id: getEntity("product", productEntity.name),
      data_source_id: dataSource.id,
      chunk_id: chunkIds[1] ?? chunkIds[0],
      evidence_text: persona.chunkContents[1],
      relevance_score: 0.85,
    });
  }
  if (primaryProblem) {
    evidenceRows.push({
      organization_id: organizationId,
      entity_id: getEntity("customer_problem", primaryProblem.name),
      data_source_id: dataSource.id,
      chunk_id: chunkIds[0],
      evidence_text: persona.chunkContents[0],
      relevance_score: 0.82,
    });
  }
  if (evidenceRows.length > 0) {
    const { error: evError } = await supabase.from("knowledge_evidence").insert(evidenceRows);
    if (evError) throw new Error(`knowledge_evidence 생성 실패: ${evError.message}`);
  }
  log(p, "데이터 소스", `data_sources 1, document_chunks ${chunkIds.length}, knowledge_evidence ${evidenceRows.length}건 생성.`);

  // 캠페인 + 전략 -----------------------------------------------------------
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organizationId,
      name: persona.campaign.name,
      product_entity_id: productEntity ? getEntity("product", productEntity.name) : null,
      goal: persona.campaign.goal,
      audience: persona.campaign.audience,
      platforms: persona.campaign.platforms as Json,
      status: "active",
    })
    .select("id")
    .single();
  if (campaignError || !campaign) throw new Error(`campaigns 생성 실패: ${campaignError?.message}`);

  const { data: run, error: runError } = await supabase
    .from("strategy_runs")
    .insert({
      organization_id: organizationId,
      campaign_id: campaign.id,
      input_data: { goal: persona.campaign.goal, audience: persona.campaign.audience } as Json,
      retrieved_chunk_ids: chunkIds as unknown as Json,
      model_name: "gpt-4o-mini",
      status: "completed",
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`strategy_runs 생성 실패: ${runError?.message}`);

  const optionRows: Database["public"]["Tables"]["strategy_options"]["Insert"][] = persona.strategyOptions.map((o) => ({
    organization_id: organizationId,
    strategy_run_id: run.id,
    strategy_type: o.strategy_type,
    title: o.title,
    summary: o.summary,
    target_problem: o.target_problem,
    core_message: o.core_message,
    content_direction: o.content_direction,
    funnel_step: o.funnel_step,
    feature_scores: o.feature_scores as Json,
    base_score: o.base_score,
    preference_score: o.preference_score,
    evidence_score: o.evidence_score,
    final_score: computeFinal(o.base_score, o.preference_score, o.evidence_score),
    reasoning: o.reasoning,
    selected: o.selected,
  }));
  const { data: options, error: optionsError } = await supabase
    .from("strategy_options")
    .insert(optionRows)
    .select("id, selected, strategy_type");
  if (optionsError || !options) throw new Error(`strategy_options 생성 실패: ${optionsError?.message}`);
  const selectedOption = options.find((o) => o.selected);
  if (!selectedOption) throw new Error("선택된 strategy_option이 없습니다.");
  log(p, "전략", `campaigns 1, strategy_runs 1, strategy_options ${options.length}건 생성.`);

  // 콘텐츠 프로젝트 + 결과물 -------------------------------------------------
  const { data: project, error: projectError } = await supabase
    .from("content_projects")
    .insert({
      organization_id: organizationId,
      campaign_id: campaign.id,
      strategy_option_id: selectedOption.id,
      title: persona.contentProjectTitle,
      core_message: persona.strategyOptions.find((o) => o.selected)?.core_message ?? "",
      target_audience: persona.campaign.audience,
      objective: persona.campaign.platforms.join(", ") + " 채널을 통한 전환 유도",
      status: "ready",
    })
    .select("id")
    .single();
  if (projectError || !project) throw new Error(`content_projects 생성 실패: ${projectError?.message}`);

  const outputRows: Database["public"]["Tables"]["content_outputs"]["Insert"][] = persona.contentOutputs.map((o) => ({
    organization_id: organizationId,
    content_project_id: project.id,
    platform: o.platform,
    title: o.title,
    hook: o.hook,
    body: o.body,
    call_to_action: o.callToAction,
    hashtags: o.hashtags as Json,
    seo_keywords: o.seoKeywords as Json,
    generation_metadata: { demo: true, note: persona.note, model: "gpt-4o-mini" } as Json,
    status: "final",
  }));
  const { data: outputs, error: outputsError } = await supabase.from("content_outputs").insert(outputRows).select("id, platform");
  if (outputsError || !outputs) throw new Error(`content_outputs 생성 실패: ${outputsError?.message}`);
  log(p, "콘텐츠", `content_projects 1, content_outputs ${outputs.length}건 생성.`);

  // 성과 기록 ---------------------------------------------------------------
  const perfRows: Database["public"]["Tables"]["performance_records"]["Insert"][] = outputs
    .slice(0, persona.performance.length)
    .map((output, index) => {
      const perf = persona.performance[index];
      const impressions = Math.round(perf.views * 1.4);
      const purchases = Math.round(perf.views * 0.006);
      return {
        organization_id: organizationId,
        content_output_id: output.id,
        impressions,
        views: perf.views,
        likes: Math.round(perf.views * 0.03),
        comments: Math.round(perf.views * 0.003),
        saves: Math.round(perf.views * 0.012),
        clicks: Math.round(perf.views * 0.05),
        inquiries: Math.round(perf.views * 0.004),
        consultations: Math.round(perf.views * 0.002),
        purchases,
        revenue: purchases * 49000,
        performance_score: perf.performanceScore,
        measured_at: dateOnly(daysAgo(persona.performance.length - index)),
      };
    });
  const { error: perfError } = await supabase.from("performance_records").insert(perfRows);
  if (perfError) throw new Error(`performance_records 생성 실패: ${perfError.message}`);
  log(p, "성과", `performance_records ${perfRows.length}건 생성.`);

  // 학습 이벤트 ---------------------------------------------------------------
  const learningRows: Database["public"]["Tables"]["learning_events"]["Insert"][] = [
    {
      organization_id: organizationId,
      event_type: "strategy_selected",
      target_type: "strategy_option",
      target_id: selectedOption.id,
      description: `"${selectedOption.strategy_type}" 전략이 최종 점수 1위로 선택되었습니다.`,
    },
    {
      organization_id: organizationId,
      event_type: "content_edited",
      target_type: "content_output",
      target_id: outputs[0]?.id ?? null,
      description: "대표 콘텐츠의 CTA 문구를 좀 더 구체적으로 수정했습니다.",
    },
    {
      organization_id: organizationId,
      event_type: "performance_registered",
      target_type: "content_output",
      target_id: outputs[2]?.id ?? outputs[0]?.id ?? null,
      description: `성과 데이터가 등록되었습니다 (성과 점수 ${persona.performance[2]?.performanceScore ?? persona.performance[0].performanceScore}점).`,
      after_state: { analysis: persona.performanceAnalysis } as Json,
    },
    {
      organization_id: organizationId,
      event_type: "preference_updated",
      target_type: "preference_weights",
      description: `실제 성과 데이터를 바탕으로 ${persona.weightLearning.label} 가중치가 조정되었습니다.`,
      before_state: { [persona.weightLearning.column]: persona.weightLearning.before } as Json,
      after_state: { [persona.weightLearning.column]: persona.weightLearning.after } as Json,
    },
  ];
  const { error: learnError } = await supabase.from("learning_events").insert(learningRows);
  if (learnError) throw new Error(`learning_events 생성 실패: ${learnError.message}`);
  log(p, "학습 이력", `${learningRows.length}건 생성.`);

  // 처리 작업 로그 ------------------------------------------------------------
  const now = new Date();
  const jobs = [
    { job_type: "data_source_extraction", offsetStartMin: 30, durationMin: 2, step: "텍스트 추출 완료" },
    { job_type: "data_source_chunking", offsetStartMin: 27, durationMin: 1, step: "문서 청크 분할 완료" },
    { job_type: "data_source_analysis", offsetStartMin: 25, durationMin: 5, step: "지식 엔터티 추출 완료" },
  ];
  const jobRows: Database["public"]["Tables"]["processing_jobs"]["Insert"][] = jobs.map((j) => {
    const startedAt = new Date(now.getTime() - j.offsetStartMin * 60_000);
    const completedAt = new Date(startedAt.getTime() + j.durationMin * 60_000);
    return {
      organization_id: organizationId,
      job_type: j.job_type,
      target_id: dataSource.id,
      status: "completed",
      progress: 100,
      current_step: j.step,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    };
  });
  const { error: jobError } = await supabase.from("processing_jobs").insert(jobRows);
  if (jobError) throw new Error(`processing_jobs 생성 실패: ${jobError.message}`);
  log(p, "처리 작업", `${jobRows.length}건 생성.`);
}

async function ensureMemberAccountEverywhere(memberUserId: string): Promise<void> {
  const orgNames = [INTHEUP_ORG_NAME, ...PERSONAS.map((p) => p.orgName)];
  for (const name of orgNames) {
    const { data: org, error } = await supabase.from("organizations").select("id").eq("name", name).limit(1).maybeSingle();
    if (error || !org) {
      console.warn(`[user-계정] 조직을 찾을 수 없어 건너뜁니다: ${name}`);
      continue;
    }
    // 이미 owner로 등록되어 있다면(예: 같은 이메일을 재사용한 경우) 낮추지 않는다 —
    // upsert에서 role은 organization_id+user_id가 이미 있으면 새 값으로 덮어쓰므로,
    // 기존 행이 없을 때만 member로 삽입한다.
    const { data: existing } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", org.id)
      .eq("user_id", memberUserId)
      .maybeSingle();
    if (existing) continue;
    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({ organization_id: org.id, user_id: memberUserId, role: "member" });
    if (memberError) throw new Error(`organization_members(member) 생성 실패: ${memberError.message}`);
  }
  log("user-계정", "멤버십", `${orgNames.length}개 워크스페이스에 member 권한을 확인/부여했습니다.`);
}

async function main() {
  console.log("=== 페르소나 예시 데이터 시드 스크립트 시작 (유튜버 / 블로거 / 셀러) ===\n");
  const demoUserId = await ensureUser(DEMO_USER_EMAIL, DEMO_USER_PASSWORD);
  for (const persona of PERSONAS) {
    await seedPersona(persona, demoUserId);
  }

  const memberUserId = await ensureUser(DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD);
  await ensureMemberAccountEverywhere(memberUserId);

  console.log("\n=== 완료 ===");
  console.log(`관리자 로그인(owner, 모드 전환 가능): ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log(`일반 사용자 로그인(member, 항상 일반 사용자 모드): ${DEMO_MEMBER_EMAIL} / ${DEMO_MEMBER_PASSWORD}`);
  console.log("로그인 후 좌측 하단 워크스페이스 전환 메뉴에서 워크스페이스를 오갈 수 있습니다:");
  console.log(` - ${INTHEUP_ORG_NAME}`);
  for (const persona of PERSONAS) {
    console.log(` - ${persona.orgName}`);
  }
}

main().catch((err) => {
  console.error("\n[시드 실패]", err instanceof Error ? err.message : err);
  process.exit(1);
});
