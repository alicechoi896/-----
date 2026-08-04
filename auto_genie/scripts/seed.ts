/**
 * 데모 워크스페이스 시드 스크립트
 * ------------------------------------------------------------------------
 * "인더업 시연 워크스페이스" (주식회사 인더업)에 면접/투자자 데모용 예시
 * 데이터를 채워 넣는다. `pnpm seed` 로 실행한다.
 *
 * 주의:
 * - 이 스크립트는 tsx로 Node에서 직접 실행되며 Next.js 모듈 해석/런타임을
 *   거치지 않는다. `lib/supabase/admin.ts` 는 최상단에서 `import "server-only"`
 *   를 하는데, 이 패키지는 Next.js(webpack)의 "react-server" 조건에서만
 *   빈 모듈을 내보내고 그 외(Node 직접 실행 등)에서는 즉시 예외를 던지도록
 *   되어 있다. 실제로 tsx로 admin.ts를 import해보면
 *   "This module cannot be imported from a Client Component module..."
 *   에러로 즉시 죽는 것을 확인했다. 따라서 여기서는 admin.ts를 import하지
 *   않고 동일한 로직(서비스 롤 클라이언트 생성)을 이 파일 안에 그대로
 *   재현한다.
 * - `@/*` 경로 별칭은 tsx가 tsconfig.json의 paths를 자동으로 읽어 해석하는
 *   것을 별도 스크립트로 직접 확인했다 (relative import로 우회할 필요 없음).
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database, Json } from "@/types/database";

// ---------------------------------------------------------------------------
// 0. .env.local 로드 (dotenv 의존성 없이 간단히 직접 파싱)
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

    // 앞뒤 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // 이미 설정된 실제 환경변수가 있으면 덮어쓰지 않는다.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// 1. 환경변수 점검
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL || "demo@intheup.example";
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD || "demo-password-1234";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "\n[오류] Supabase 환경변수가 설정되지 않았습니다.\n" +
      "프로젝트 루트에 .env.local 파일을 만들고 다음 값을 채워주세요:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=...\n" +
      "(.env.example 파일을 참고하세요.)\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. 서비스 롤 클라이언트 생성 (lib/supabase/admin.ts와 동일한 로직)
// ---------------------------------------------------------------------------

const supabase = createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const ORG_NAME = "주식회사 인더업";
const DEMO_NOTE = "벤처기업 평가를 위한 시연용 예시 데이터입니다.";
const DEMO_METADATA: Json = { demo: true, note: DEMO_NOTE };

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function log(section: string, message: string) {
  console.log(`[${section}] ${message}`);
}

// ---------------------------------------------------------------------------
// 3. 조직 확보 (있으면 재사용, 없으면 생성)
// ---------------------------------------------------------------------------

async function ensureOrganization(): Promise<{ id: string; isNew: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", ORG_NAME)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`organizations 조회 실패: ${selectError.message}`);
  }

  if (existing) {
    log("조직", `기존 조직을 재사용합니다 (id=${existing.id}). 전체 재시딩 대신 지식/규칙만 재적용합니다.`);
    return { id: existing.id, isNew: false };
  }

  const { data: created, error: insertError } = await supabase
    .from("organizations")
    .insert({
      name: ORG_NAME,
      industry: "AI 기반 마케팅 콘텐츠 자동화 SaaS 플랫폼",
      description:
        `${DEMO_NOTE} 소상공인과 1인 사업자가 AI로 상품 분석부터 콘텐츠 제작, 성과 학습까지 ` +
        "자동화할 수 있도록 돕는 인더업의 데모 워크스페이스입니다.",
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(`organizations 생성 실패: ${insertError?.message}`);
  }

  log("조직", `새 조직을 생성했습니다 (id=${created.id}).`);
  return { id: created.id, isNew: true };
}

// ---------------------------------------------------------------------------
// 4. 데모 로그인 계정 확보 + owner 멤버십
// ---------------------------------------------------------------------------

async function ensureDemoUser(): Promise<string> {
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) {
    throw new Error(`auth 사용자 목록 조회 실패: ${listError.message}`);
  }

  const found = listData.users.find((u) => u.email === DEMO_USER_EMAIL);
  if (found) {
    log("데모 계정", `기존 데모 계정을 재사용합니다 (${DEMO_USER_EMAIL}).`);
    return found.id;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: DEMO_USER_EMAIL,
    password: DEMO_USER_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`데모 계정 생성 실패: ${createError?.message}`);
  }

  log("데모 계정", `데모 계정을 새로 생성했습니다 (${DEMO_USER_EMAIL}).`);
  return created.user.id;
}

async function ensureOwnerMembership(organizationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .upsert(
      { organization_id: organizationId, user_id: userId, role: "owner" },
      { onConflict: "organization_id,user_id" }
    );
  if (error) {
    throw new Error(`organization_members upsert 실패: ${error.message}`);
  }
  log("데모 계정", "조직 owner 멤버십을 확인/부여했습니다.");
}

// ---------------------------------------------------------------------------
// 5. 지식 엔터티 (knowledge_entities) — 항상 upsert (idempotent)
// ---------------------------------------------------------------------------

type EntityType = Database["public"]["Tables"]["knowledge_entities"]["Row"]["entity_type"];

interface EntitySeed {
  entityType: EntityType;
  name: string;
  summary: string;
  confidenceScore: number;
}

const ENTITY_SEEDS: EntitySeed[] = [
  // product
  {
    entityType: "product",
    name: "AI 콘텐츠 자동화 교육",
    summary:
      "소상공인과 1인 사업자가 AI를 활용해 상품 분석부터 콘텐츠 기획, 제작, 성과 학습까지 " +
      "직접 자동화할 수 있도록 돕는 실전 교육 상품.",
    confidenceScore: 0.92,
  },
  // audience (5)
  {
    entityType: "audience",
    name: "소상공인",
    summary: "오프라인/온라인 매장을 운영하며 마케팅에 쓸 시간과 인력이 부족한 사업자.",
    confidenceScore: 0.88,
  },
  {
    entityType: "audience",
    name: "1인 사업자",
    summary: "상품 기획부터 판매, 마케팅까지 혼자 처리해야 해서 콘텐츠 제작에 시간을 쓰기 어려운 사업자.",
    confidenceScore: 0.85,
  },
  {
    entityType: "audience",
    name: "온라인 판매자",
    summary: "스마트스토어 등에서 상품을 판매하며 지속적인 콘텐츠 노출과 유입이 필요한 판매자.",
    confidenceScore: 0.83,
  },
  {
    entityType: "audience",
    name: "강사",
    summary: "자신의 지식과 노하우를 알리고 수강생을 모집해야 하는 강사/교육 사업자.",
    confidenceScore: 0.8,
  },
  {
    entityType: "audience",
    name: "콘텐츠 크리에이터",
    summary: "채널을 운영하지만 콘텐츠 기획과 편집에 많은 시간을 쓰고 있는 크리에이터.",
    confidenceScore: 0.78,
  },
  // customer_problem (5)
  {
    entityType: "customer_problem",
    name: "콘텐츠를 지속적으로 제작하기 어려움",
    summary: "아이디어 고갈과 시간 부족으로 콘텐츠 발행 주기를 꾸준히 유지하지 못함.",
    confidenceScore: 0.9,
  },
  {
    entityType: "customer_problem",
    name: "상품 분석과 콘텐츠 제작 업무가 분리됨",
    summary: "상품/고객 분석과 실제 콘텐츠 제작이 다른 도구·다른 사람에게 맡겨져 있어 일관성이 떨어짐.",
    confidenceScore: 0.82,
  },
  {
    entityType: "customer_problem",
    name: "플랫폼마다 콘텐츠를 다시 수정해야 함",
    summary: "네이버 블로그, 인스타그램, 숏폼 등 채널별로 포맷을 다시 손봐야 해서 반복 작업이 많음.",
    confidenceScore: 0.79,
  },
  {
    entityType: "customer_problem",
    name: "조회수는 발생하지만 매출로 연결되지 않음",
    summary: "콘텐츠 노출과 조회수는 있지만 문의·상담·구매 등 실제 전환으로 이어지지 않음.",
    confidenceScore: 0.86,
  },
  {
    entityType: "customer_problem",
    name: "마케팅 전문 인력을 고용하기 어려움",
    summary: "예산·조직 규모상 전담 마케터를 채용하기 어려워 마케팅 역량이 내부에 축적되지 않음.",
    confidenceScore: 0.81,
  },
  // expertise (6)
  {
    entityType: "expertise",
    name: "유튜브 채널 운영 경험",
    summary: "실제 유튜브 채널을 기획·운영하며 얻은 콘텐츠 제작 및 알고리즘 대응 노하우.",
    confidenceScore: 0.84,
  },
  {
    entityType: "expertise",
    name: "AI 콘텐츠 제작",
    summary: "생성형 AI를 활용한 문구, 이미지, 영상 콘텐츠 제작 실무 경험.",
    confidenceScore: 0.88,
  },
  {
    entityType: "expertise",
    name: "숏폼 콘텐츠",
    summary: "인스타그램 릴스, 유튜브 쇼츠 등 숏폼 콘텐츠 기획 및 후킹 구조 설계 경험.",
    confidenceScore: 0.83,
  },
  {
    entityType: "expertise",
    name: "온라인 교육",
    summary: "온라인 강의 기획, 커리큘럼 설계, 수강생 모집 및 운영 경험.",
    confidenceScore: 0.8,
  },
  {
    entityType: "expertise",
    name: "디지털 마케팅",
    summary: "퍼포먼스 마케팅, SEO, 콘텐츠 마케팅 전반에 대한 실무 지식.",
    confidenceScore: 0.79,
  },
  {
    entityType: "expertise",
    name: "마케팅 자동화",
    summary: "반복적인 마케팅 업무를 도구와 워크플로우로 자동화한 경험과 노하우.",
    confidenceScore: 0.86,
  },
  // desire
  {
    entityType: "desire",
    name: "적은 인력으로 꾸준히 콘텐츠를 발행하고 싶음",
    summary: "인력을 늘리지 않고도 채널별 콘텐츠 발행 주기를 안정적으로 유지하고 싶어함.",
    confidenceScore: 0.75,
  },
  {
    entityType: "desire",
    name: "콘텐츠 조회수를 실제 문의와 매출로 연결하고 싶음",
    summary: "단순 노출이 아니라 문의, 상담, 구매로 이어지는 콘텐츠를 원함.",
    confidenceScore: 0.8,
  },
  {
    entityType: "desire",
    name: "마케팅을 외주 없이 내부에서 자체적으로 해결하고 싶음",
    summary: "외주 대행사에 의존하지 않고 내부 역량만으로 마케팅을 지속하고 싶어함.",
    confidenceScore: 0.72,
  },
  // objection
  {
    entityType: "objection",
    name: "AI가 만든 콘텐츠는 진정성이 없어 보일 것 같다",
    summary: "AI 생성 콘텐츠가 획일적이거나 브랜드 목소리와 맞지 않을 것이라는 우려.",
    confidenceScore: 0.7,
  },
  {
    entityType: "objection",
    name: "이미 여러 마케팅 도구를 써봤지만 효과를 보지 못했다",
    summary: "기존 마케팅 툴 도입 실패 경험으로 인한 신규 도구 도입에 대한 회의감.",
    confidenceScore: 0.68,
  },
  // solution
  {
    entityType: "solution",
    name: "AI 기반 상품 분석 및 지식그래프 자동 구축",
    summary: "회사/상품 자료를 분석해 고객, 문제, 강점을 지식그래프로 자동 정리.",
    confidenceScore: 0.87,
  },
  {
    entityType: "solution",
    name: "고객 문제 진단 기반 전략 자동 추천",
    summary: "축적된 지식그래프를 근거로 콘텐츠 전략 옵션을 점수화해 자동 추천.",
    confidenceScore: 0.85,
  },
  {
    entityType: "solution",
    name: "플랫폼별 맞춤 콘텐츠 자동 생성 및 성과 학습",
    summary: "선택된 전략을 채널별 포맷에 맞게 자동 생성하고, 성과 데이터를 학습해 다음 추천에 반영.",
    confidenceScore: 0.83,
  },
  // brand_expression
  {
    entityType: "brand_expression",
    name: "쉽고 실전적인 화법으로 설명합니다",
    summary: "전문 용어 대신 실제 사례와 쉬운 표현으로 설명하는 브랜드 톤.",
    confidenceScore: 0.76,
  },
  {
    entityType: "brand_expression",
    name: "숫자와 데이터로 신뢰를 뒷받침합니다",
    summary: "주장에는 항상 근거가 되는 수치나 사례를 함께 제시하는 브랜드 화법.",
    confidenceScore: 0.74,
  },
];

async function upsertEntities(organizationId: string): Promise<Map<string, string>> {
  const rows = ENTITY_SEEDS.map((e) => ({
    organization_id: organizationId,
    entity_type: e.entityType,
    name: e.name,
    summary: e.summary,
    confidence_score: e.confidenceScore,
    metadata: DEMO_METADATA,
  }));

  const { data, error } = await supabase
    .from("knowledge_entities")
    .upsert(rows, { onConflict: "organization_id,entity_type,name" })
    .select("id, entity_type, name");

  if (error || !data) {
    throw new Error(`knowledge_entities upsert 실패: ${error?.message}`);
  }

  const map = new Map<string, string>();
  for (const row of data) {
    map.set(`${row.entity_type}::${row.name}`, row.id);
  }

  log("지식그래프", `고객/문제/전문성 등 엔터티 ${data.length}건을 upsert 했습니다.`);
  return map;
}

async function seedRelations(organizationId: string, entityMap: Map<string, string>): Promise<void> {
  const get = (type: EntityType, name: string): string => {
    const id = entityMap.get(`${type}::${name}`);
    if (!id) throw new Error(`엔터티를 찾을 수 없습니다: ${type}::${name}`);
    return id;
  };

  const relations: Database["public"]["Tables"]["knowledge_relations"]["Insert"][] = [
    {
      organization_id: organizationId,
      source_entity_id: get("customer_problem", "콘텐츠를 지속적으로 제작하기 어려움"),
      target_entity_id: get("solution", "플랫폼별 맞춤 콘텐츠 자동 생성 및 성과 학습"),
      relation_type: "solved_by",
      description: "지속적인 콘텐츠 제작 부담은 채널별 자동 생성으로 해결.",
      confidence_score: 0.82,
    },
    {
      organization_id: organizationId,
      source_entity_id: get("customer_problem", "조회수는 발생하지만 매출로 연결되지 않음"),
      target_entity_id: get("solution", "고객 문제 진단 기반 전략 자동 추천"),
      relation_type: "solved_by",
      description: "노출 대비 낮은 전환 문제는 문제 진단형 전략 추천으로 개선.",
      confidence_score: 0.8,
    },
    {
      organization_id: organizationId,
      source_entity_id: get("customer_problem", "상품 분석과 콘텐츠 제작 업무가 분리됨"),
      target_entity_id: get("solution", "AI 기반 상품 분석 및 지식그래프 자동 구축"),
      relation_type: "solved_by",
      description: "상품 분석과 콘텐츠 제작을 하나의 지식그래프로 연결.",
      confidence_score: 0.78,
    },
    {
      organization_id: organizationId,
      source_entity_id: get("desire", "콘텐츠 조회수를 실제 문의와 매출로 연결하고 싶음"),
      target_entity_id: get("product", "AI 콘텐츠 자동화 교육"),
      relation_type: "fulfilled_by",
      description: "전환 중심 콘텐츠를 만들고 싶은 니즈를 교육 상품이 충족.",
      confidence_score: 0.75,
    },
    {
      organization_id: organizationId,
      source_entity_id: get("product", "AI 콘텐츠 자동화 교육"),
      target_entity_id: get("audience", "소상공인"),
      relation_type: "targets",
      description: "핵심 타겟 고객군.",
      confidence_score: 0.85,
    },
  ];

  const { error } = await supabase.from("knowledge_relations").insert(relations);
  if (error) {
    throw new Error(`knowledge_relations 삽입 실패: ${error.message}`);
  }
  log("지식그래프", `지식 관계(knowledge_relations) ${relations.length}건을 생성했습니다.`);
}

// ---------------------------------------------------------------------------
// 6. 의사결정 규칙 (decision_rules) — 항상 upsert (idempotent)
// ---------------------------------------------------------------------------

async function upsertDecisionRules(organizationId: string): Promise<void> {
  const rows: Database["public"]["Tables"]["decision_rules"]["Insert"][] = [
    {
      organization_id: organizationId,
      rule_name: "매출 전환 콘텐츠 판단",
      condition_text: "콘텐츠 조회수는 높지만 문의가 낮음",
      action_text: "일반 정보형 콘텐츠보다 고객 문제 진단형 콘텐츠 비중을 확대",
      reason_text: "대중의 관심과 구매 고객의 문제 인식은 다를 수 있음",
      rule_category: "content_strategy",
      weight: 0.8,
      confidence_score: 0.75,
      is_active: true,
    },
    {
      organization_id: organizationId,
      rule_name: "고가 상품 신뢰 형성 우선",
      condition_text: "고가 상품의 판매 콘텐츠를 기획함",
      action_text: "상품 기능보다 고객 문제, 신뢰, 사례, 실행 가능성을 먼저 제시",
      reason_text: "구매 전 신뢰 형성이 필요함",
      rule_category: "trust_building",
      weight: 0.75,
      confidence_score: 0.7,
      is_active: true,
    },
    {
      organization_id: organizationId,
      rule_name: "숏폼 초반 이탈 방지",
      condition_text: "숏폼 콘텐츠의 초반 이탈률이 높음",
      action_text: "첫 3초 안에 고객의 문제 또는 결과를 명확히 제시",
      reason_text: "초반 메시지가 불명확하면 본문 이전에 이탈할 가능성이 높음",
      rule_category: "engagement",
      weight: 0.85,
      confidence_score: 0.8,
      is_active: true,
    },
  ];

  const { error } = await supabase
    .from("decision_rules")
    .upsert(rows, { onConflict: "organization_id,rule_name" });

  if (error) {
    throw new Error(`decision_rules upsert 실패: ${error.message}`);
  }
  log("의사결정 규칙", `decision_rules ${rows.length}건을 upsert 했습니다.`);
}

// ---------------------------------------------------------------------------
// 7. 데이터 소스 + 청크 + 근거 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

async function seedDataSourceAndEvidence(
  organizationId: string,
  entityMap: Map<string, string>
): Promise<{ dataSourceId: string; chunkIds: string[] }> {
  const companyText =
    `${DEMO_NOTE}\n\n` +
    "주식회사 인더업은 AI 기반 마케팅 콘텐츠 자동화 SaaS 플랫폼을 운영합니다. " +
    "소상공인, 1인 사업자, 온라인 판매자가 상품 분석부터 전략 수립, 채널별 콘텐츠 제작, " +
    "성과 학습까지 하나의 흐름으로 자동화할 수 있도록 돕습니다. " +
    "특히 콘텐츠 조회수는 발생하지만 매출로 연결되지 않는 문제, 마케팅 전문 인력을 " +
    "고용하기 어려운 문제를 해결하는 데 집중하고 있으며, 유튜브 채널 운영과 숏폼 콘텐츠 제작 " +
    "경험을 바탕으로 실전적인 콘텐츠 자동화 교육 상품도 함께 제공합니다.";

  const { data: dataSource, error: dsError } = await supabase
    .from("data_sources")
    .insert({
      organization_id: organizationId,
      source_type: "text",
      title: "인더업 회사 소개 문서",
      original_text: companyText,
      extracted_text: companyText,
      status: "completed",
      processing_progress: 100,
      metadata: DEMO_METADATA,
    })
    .select("id")
    .single();

  if (dsError || !dataSource) {
    throw new Error(`data_sources 생성 실패: ${dsError?.message}`);
  }

  const chunkContents = [
    "주식회사 인더업은 AI 기반 마케팅 콘텐츠 자동화 SaaS 플랫폼을 운영합니다. " +
      "소상공인, 1인 사업자, 온라인 판매자가 상품 분석부터 전략 수립, 채널별 콘텐츠 제작, " +
      "성과 학습까지 하나의 흐름으로 자동화할 수 있도록 돕습니다.",
    "특히 콘텐츠 조회수는 발생하지만 매출로 연결되지 않는 문제, 마케팅 전문 인력을 " +
      "고용하기 어려운 문제를 해결하는 데 집중하고 있으며, 유튜브 채널 운영과 숏폼 콘텐츠 " +
      "제작 경험을 바탕으로 실전적인 콘텐츠 자동화 교육 상품도 함께 제공합니다.",
  ];

  const chunkRows: Database["public"]["Tables"]["document_chunks"]["Insert"][] = chunkContents.map(
    (content, index) => ({
      organization_id: organizationId,
      data_source_id: dataSource.id,
      chunk_index: index,
      content,
      token_count: Math.ceil(content.length / 2),
      embedding: null,
      embedding_model: null,
      embedding_dimension: null,
      metadata: { seed: true, demo: true, note: DEMO_NOTE } as Json,
    })
  );

  const { data: chunks, error: chunkError } = await supabase
    .from("document_chunks")
    .insert(chunkRows)
    .select("id, chunk_index");

  if (chunkError || !chunks) {
    throw new Error(`document_chunks 생성 실패: ${chunkError?.message}`);
  }

  const chunkIds = chunks
    .sort((a, b) => a.chunk_index - b.chunk_index)
    .map((c) => c.id);

  const productId = entityMap.get("product::AI 콘텐츠 자동화 교육");
  const problemId = entityMap.get(
    "customer_problem::조회수는 발생하지만 매출로 연결되지 않음"
  );

  const evidenceRows: Database["public"]["Tables"]["knowledge_evidence"]["Insert"][] = [];
  if (productId) {
    evidenceRows.push({
      organization_id: organizationId,
      entity_id: productId,
      data_source_id: dataSource.id,
      chunk_id: chunkIds[1] ?? chunkIds[0],
      evidence_text: chunkContents[1],
      relevance_score: 0.86,
    });
  }
  if (problemId) {
    evidenceRows.push({
      organization_id: organizationId,
      entity_id: problemId,
      data_source_id: dataSource.id,
      chunk_id: chunkIds[1] ?? chunkIds[0],
      evidence_text: chunkContents[1],
      relevance_score: 0.82,
    });
  }

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await supabase.from("knowledge_evidence").insert(evidenceRows);
    if (evidenceError) {
      throw new Error(`knowledge_evidence 생성 실패: ${evidenceError.message}`);
    }
  }

  log(
    "데이터 소스",
    `data_sources 1건, document_chunks ${chunkIds.length}건, knowledge_evidence ${evidenceRows.length}건을 생성했습니다.`
  );

  return { dataSourceId: dataSource.id, chunkIds };
}

// ---------------------------------------------------------------------------
// 8. 브랜드 프로필 + 선호 가중치 (organization_id unique → upsert)
// ---------------------------------------------------------------------------

async function upsertBrandProfile(organizationId: string): Promise<void> {
  const { error } = await supabase.from("brand_profiles").upsert(
    {
      organization_id: organizationId,
      core_message: "혼자서도 AI로 상품 분석부터 콘텐츠 제작, 매출 전환까지 자동화할 수 있습니다.",
      tone: ["친근함", "실전적", "신뢰감"] as Json,
      preferred_expressions: ["실전 노하우", "바로 적용 가능한", "데이터 기반"] as Json,
      prohibited_expressions: ["무조건", "100% 보장", "과장된 수치"] as Json,
      target_audiences: ["소상공인", "1인 사업자", "온라인 판매자", "강사", "콘텐츠 크리에이터"] as Json,
      persuasion_structure: ["문제 제시", "공감", "해결 방법", "근거/사례", "행동 유도"] as Json,
      expertise_areas: ["AI 콘텐츠 제작", "숏폼 콘텐츠", "디지털 마케팅", "마케팅 자동화"] as Json,
    },
    { onConflict: "organization_id" }
  );
  if (error) {
    throw new Error(`brand_profiles upsert 실패: ${error.message}`);
  }
  log("브랜드 프로필", "brand_profiles를 upsert 했습니다.");
}

async function upsertPreferenceWeights(organizationId: string): Promise<void> {
  const { error } = await supabase.from("preference_weights").upsert(
    {
      organization_id: organizationId,
      clarity_weight: 1.0,
      authority_weight: 1.2,
      purchase_link_weight: 1.0,
      brand_fit_weight: 1.0,
      novelty_weight: 0.9,
      empathy_weight: 1.15,
    },
    { onConflict: "organization_id" }
  );
  if (error) {
    throw new Error(`preference_weights upsert 실패: ${error.message}`);
  }
  log("선호 가중치", "preference_weights를 upsert 했습니다 (authority/empathy를 살짝 학습된 값으로 조정).");
}

// ---------------------------------------------------------------------------
// 9. 캠페인 + 전략 실행 + 전략 옵션 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

interface StrategyResult {
  campaignId: string;
  strategyRunId: string;
  selectedStrategyOptionId: string;
  allStrategyOptionIds: string[];
}

async function seedCampaignAndStrategy(
  organizationId: string,
  entityMap: Map<string, string>,
  chunkIds: string[]
): Promise<StrategyResult> {
  const productId = entityMap.get("product::AI 콘텐츠 자동화 교육") ?? null;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organizationId,
      name: "AI 콘텐츠 자동화 교육 문의 전환 캠페인",
      product_entity_id: productId,
      goal: "inquiries",
      audience: "소상공인, 1인 사업자, 온라인 판매자",
      platforms: ["naver_blog", "instagram", "youtube_shorts"] as Json,
      status: "active",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    throw new Error(`campaigns 생성 실패: ${campaignError?.message}`);
  }

  const { data: run, error: runError } = await supabase
    .from("strategy_runs")
    .insert({
      organization_id: organizationId,
      campaign_id: campaign.id,
      input_data: {
        goal: "inquiries",
        audience: "소상공인, 1인 사업자, 온라인 판매자",
        current_problem: "조회수는 발생하지만 매출로 연결되지 않음",
      } as Json,
      retrieved_chunk_ids: chunkIds as unknown as Json,
      model_name: "gpt-4o-mini",
      status: "completed",
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`strategy_runs 생성 실패: ${runError?.message}`);
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

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const computeFinal = (base: number, preference: number, evidence: number) =>
    round2(base * 0.5 + preference * 0.25 + evidence * 0.25);

  const optionSeeds: StrategyOptionSeed[] = [
    {
      strategy_type: "문제 진단형",
      title: "\"조회수는 있는데 문의가 없다면\" 문제 진단 콘텐츠",
      summary: "고객이 겪는 전환 부진의 원인을 짚어주고, 원인별 해결 방향을 제시하는 진단형 콘텐츠.",
      target_problem: "조회수는 발생하지만 매출로 연결되지 않음",
      core_message: "문제를 정확히 진단하면 전환은 자연스럽게 따라옵니다.",
      content_direction: "흔한 착각 3가지 → 실제 원인 → 해결 방향 순으로 전개",
      funnel_step: "consideration",
      feature_scores: { clarity: 85, authority: 70, purchaseLink: 60, brandFit: 80, novelty: 65, empathy: 90 },
      base_score: 82,
      preference_score: 88,
      evidence_score: 80,
      reasoning: "고객 문제 인식과 맞닿아 있어 공감(empathy)과 명확성(clarity) 점수가 높음.",
      selected: true,
    },
    {
      strategy_type: "성공 사례형",
      title: "혼자서도 매출을 만든 소상공인 사례",
      summary: "실제 소상공인이 AI 콘텐츠 자동화로 매출 전환을 만든 과정을 스토리로 전달.",
      target_problem: "마케팅 전문 인력을 고용하기 어려움",
      core_message: "전문 인력 없이도 결과를 만들 수 있습니다.",
      content_direction: "Before/After 구조로 실제 수치와 함께 전달",
      funnel_step: "consideration",
      feature_scores: { clarity: 75, authority: 85, purchaseLink: 70, brandFit: 78, novelty: 60, empathy: 75 },
      base_score: 78,
      preference_score: 80,
      evidence_score: 85,
      reasoning: "구체적 사례로 신뢰(authority)와 근거(evidence) 점수가 높음.",
      selected: false,
    },
    {
      strategy_type: "전문지식형",
      title: "AI 콘텐츠 자동화, 어디까지 가능할까",
      summary: "AI 콘텐츠 자동화의 기술적 원리와 활용 범위를 전문가 시각에서 설명.",
      target_problem: "상품 분석과 콘텐츠 제작 업무가 분리됨",
      core_message: "지식그래프 기반 자동화는 단순 생성과 다릅니다.",
      content_direction: "개념 설명 → 활용 사례 → 한계와 보완점 순으로 전개",
      funnel_step: "awareness",
      feature_scores: { clarity: 80, authority: 92, purchaseLink: 55, brandFit: 75, novelty: 58, empathy: 60 },
      base_score: 75,
      preference_score: 70,
      evidence_score: 88,
      reasoning: "전문성(authority)은 높지만 구매 링크 연결성(purchaseLink)이 낮아 최종 순위는 중간.",
      selected: false,
    },
    {
      strategy_type: "반론 해결형",
      title: "AI가 만든 콘텐츠, 정말 우리 브랜드 같을까?",
      summary: "AI 콘텐츠에 대한 대표적인 우려(진정성, 효과 없음)를 정면으로 다루고 해소.",
      target_problem: "AI가 만든 콘텐츠는 진정성이 없어 보일 것 같다",
      core_message: "AI는 브랜드 목소리를 대체하지 않고 반영합니다.",
      content_direction: "우려 제시 → 실제 작동 방식 설명 → 안심시키는 근거 제시",
      funnel_step: "decision",
      feature_scores: { clarity: 78, authority: 80, purchaseLink: 65, brandFit: 72, novelty: 62, empathy: 70 },
      base_score: 73,
      preference_score: 68,
      evidence_score: 75,
      reasoning: "반론 해소형 콘텐츠라 결정 단계(funnel)에는 유효하나 전반적 점수는 가장 낮음.",
      selected: false,
    },
  ];

  const optionRows: Database["public"]["Tables"]["strategy_options"]["Insert"][] = optionSeeds.map(
    (o) => ({
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
    })
  );

  const { data: options, error: optionsError } = await supabase
    .from("strategy_options")
    .insert(optionRows)
    .select("id, selected, strategy_type");

  if (optionsError || !options) {
    throw new Error(`strategy_options 생성 실패: ${optionsError?.message}`);
  }

  const selected = options.find((o) => o.selected);
  if (!selected) {
    throw new Error("선택된(selected=true) strategy_option이 없습니다.");
  }

  log(
    "전략",
    `campaigns 1건, strategy_runs 1건, strategy_options ${options.length}건을 생성했습니다 ` +
      `(선택된 전략: ${selected.strategy_type}).`
  );

  return {
    campaignId: campaign.id,
    strategyRunId: run.id,
    selectedStrategyOptionId: selected.id,
    allStrategyOptionIds: options.map((o) => o.id),
  };
}

// ---------------------------------------------------------------------------
// 10. 콘텐츠 프로젝트 + 콘텐츠 결과물 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

async function seedContentProjectAndOutputs(
  organizationId: string,
  campaignId: string,
  strategyOptionId: string
): Promise<string[]> {
  const { data: project, error: projectError } = await supabase
    .from("content_projects")
    .insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      strategy_option_id: strategyOptionId,
      title: "\"조회수는 있는데 문의가 없다면\" 문제 진단 콘텐츠 제작",
      core_message: "문제를 정확히 진단하면 전환은 자연스럽게 따라옵니다.",
      target_audience: "소상공인, 1인 사업자",
      objective: "네이버 블로그·인스타그램·유튜브 쇼츠를 통한 무료 진단 문의 유도",
      status: "ready",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(`content_projects 생성 실패: ${projectError?.message}`);
  }

  const outputRows: Database["public"]["Tables"]["content_outputs"]["Insert"][] = [
    {
      organization_id: organizationId,
      content_project_id: project.id,
      platform: "naver_blog",
      title: "혼자 운영하는 소상공인, 조회수는 있는데 왜 문의가 없을까요?",
      hook: "매일 콘텐츠를 올리는데 정작 문의는 늘지 않아 답답하셨다면, 원인은 콘텐츠 양이 아닐 수 있습니다.",
      body:
        "많은 소상공인 사장님들이 '콘텐츠를 더 많이 올리면 매출도 오르겠지'라고 생각하지만, " +
        "실제로는 조회수와 구매 전환은 다른 문제인 경우가 많습니다.\n\n" +
        "조회수가 높은 콘텐츠는 '대중의 관심'을 얻은 것이고, 문의로 이어지는 콘텐츠는 " +
        "'구매를 고민 중인 고객의 문제'를 정확히 짚어준 것입니다. 이 둘을 구분하지 않고 " +
        "같은 방식으로만 콘텐츠를 만들면 아무리 발행량을 늘려도 매출은 제자리일 수 있습니다.\n\n" +
        "AI 콘텐츠 자동화 교육에서는 상품 분석부터 고객 문제 진단, 채널별 콘텐츠 제작까지 " +
        "하나의 흐름으로 자동화하는 방법을 알려드립니다.",
      call_to_action: "지금 무료 진단을 받아보고 우리 브랜드에 맞는 콘텐츠 전략을 확인해보세요.",
      hashtags: ["#소상공인마케팅", "#AI콘텐츠", "#콘텐츠자동화", "#1인사업자"] as Json,
      seo_keywords: ["AI 콘텐츠 자동화", "소상공인 마케팅", "콘텐츠 제작 자동화"] as Json,
      generation_metadata: { demo: true, note: DEMO_NOTE, model: "gpt-4o-mini" } as Json,
      status: "final",
    },
    {
      organization_id: organizationId,
      content_project_id: project.id,
      platform: "instagram",
      title: "조회수 vs 문의, 다른 게임입니다",
      hook: "이 콘텐츠, 저장하지 말고 지금 바로 읽어보세요.",
      body:
        "✔️ 조회수는 높은데 문의는 없다\n" +
        "✔️ 콘텐츠는 꾸준히 올리는데 매출은 그대로다\n\n" +
        "이런 고민, 콘텐츠 '양'이 아니라 '방향'의 문제일 수 있어요.\n" +
        "구매를 고민하는 고객은 정보가 아니라 '내 문제를 알아주는' 콘텐츠에 반응합니다.",
      call_to_action: "프로필 링크에서 무료로 콘텐츠 전략 진단받아보세요.",
      hashtags: ["#소상공인", "#마케팅자동화", "#콘텐츠전략", "#AI마케팅"] as Json,
      seo_keywords: ["콘텐츠 전략", "AI 마케팅", "문의 전환"] as Json,
      generation_metadata: { demo: true, note: DEMO_NOTE, model: "gpt-4o-mini" } as Json,
      status: "final",
    },
    {
      organization_id: organizationId,
      content_project_id: project.id,
      platform: "youtube_shorts",
      title: "조회수는 있는데 문의가 없는 이유 (15초 설명)",
      hook: "조회수는 잘 나오는데 문의가 없다? 콘텐츠를 더 만들기 전에 이것부터 확인하세요.",
      body:
        "0-3초: '조회수는 잘 나오는데 문의가 없다면?'\n" +
        "4-9초: 대중이 좋아하는 콘텐츠와 구매 고객이 반응하는 콘텐츠는 다릅니다.\n" +
        "10-15초: 고객의 문제를 짚어주는 콘텐츠가 진짜 문의를 만듭니다.",
      call_to_action: "프로필 링크에서 무료 진단 받아보기",
      hashtags: ["#숏폼마케팅", "#AI콘텐츠자동화", "#소상공인"] as Json,
      seo_keywords: ["숏폼 마케팅", "AI 콘텐츠 자동화"] as Json,
      generation_metadata: { demo: true, note: DEMO_NOTE, model: "gpt-4o-mini" } as Json,
      status: "final",
    },
  ];

  const { data: outputs, error: outputsError } = await supabase
    .from("content_outputs")
    .insert(outputRows)
    .select("id, platform");

  if (outputsError || !outputs) {
    throw new Error(`content_outputs 생성 실패: ${outputsError?.message}`);
  }

  log("콘텐츠", `content_projects 1건, content_outputs ${outputs.length}건을 생성했습니다.`);
  return outputs.map((o) => o.id);
}

// ---------------------------------------------------------------------------
// 11. 성과 기록 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

async function seedPerformanceRecords(organizationId: string, contentOutputIds: string[]): Promise<void> {
  const perfSeeds = [
    {
      impressions: 12400,
      views: 8300,
      likes: 410,
      comments: 36,
      saves: 152,
      clicks: 590,
      inquiries: 47,
      consultations: 22,
      purchases: 6,
      revenue: 2940000,
      performance_score: 78.5,
      measured_at: dateOnly(daysAgo(3)),
    },
    {
      impressions: 9800,
      views: 6100,
      likes: 520,
      comments: 41,
      saves: 210,
      clicks: 380,
      inquiries: 33,
      consultations: 15,
      purchases: 4,
      revenue: 1960000,
      performance_score: 71.2,
      measured_at: dateOnly(daysAgo(2)),
    },
    {
      impressions: 15600,
      views: 11200,
      likes: 890,
      comments: 58,
      saves: 340,
      clicks: 720,
      inquiries: 52,
      consultations: 28,
      purchases: 9,
      revenue: 4410000,
      performance_score: 84.1,
      measured_at: dateOnly(daysAgo(1)),
    },
  ];

  const rows: Database["public"]["Tables"]["performance_records"]["Insert"][] = contentOutputIds
    .slice(0, perfSeeds.length)
    .map((contentOutputId, index) => ({
      organization_id: organizationId,
      content_output_id: contentOutputId,
      ...perfSeeds[index],
    }));

  const { error } = await supabase.from("performance_records").insert(rows);
  if (error) {
    throw new Error(`performance_records 생성 실패: ${error.message}`);
  }
  log("성과", `performance_records ${rows.length}건을 생성했습니다.`);
}

// ---------------------------------------------------------------------------
// 12. 학습 이벤트 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

async function seedLearningEvents(
  organizationId: string,
  strategy: StrategyResult,
  contentOutputIds: string[]
): Promise<void> {
  const rows: Database["public"]["Tables"]["learning_events"]["Insert"][] = [
    {
      organization_id: organizationId,
      event_type: "strategy_selected",
      target_type: "strategy_option",
      target_id: strategy.selectedStrategyOptionId,
      description: "\"문제 진단형\" 전략이 최종 점수 1위로 선택되었습니다.",
    },
    {
      organization_id: organizationId,
      event_type: "content_edited",
      target_type: "content_output",
      target_id: contentOutputIds[0] ?? null,
      description: "네이버 블로그 콘텐츠의 CTA 문구를 좀 더 구체적으로 수정했습니다.",
    },
    {
      organization_id: organizationId,
      event_type: "performance_registered",
      target_type: "content_output",
      target_id: contentOutputIds[2] ?? contentOutputIds[0] ?? null,
      description: "유튜브 쇼츠 콘텐츠의 성과 데이터가 등록되었습니다 (성과 점수 84.1점).",
    },
    {
      organization_id: organizationId,
      event_type: "preference_updated",
      target_type: "preference_weights",
      description: "실제 성과 데이터를 바탕으로 authority/empathy 가중치가 소폭 상향 조정되었습니다.",
    },
  ];

  const { error } = await supabase.from("learning_events").insert(rows);
  if (error) {
    throw new Error(`learning_events 생성 실패: ${error.message}`);
  }
  log("학습 이력", `learning_events ${rows.length}건을 생성했습니다.`);
}

// ---------------------------------------------------------------------------
// 13. 처리 작업 로그 (신규 조직일 때만 생성)
// ---------------------------------------------------------------------------

async function seedProcessingJobs(organizationId: string, dataSourceId: string): Promise<void> {
  const now = new Date();
  const jobs = [
    { job_type: "data_source_extraction", offsetStartMin: 30, durationMin: 2, step: "텍스트 추출 완료" },
    { job_type: "data_source_chunking", offsetStartMin: 27, durationMin: 1, step: "문서 청크 분할 완료" },
    { job_type: "data_source_analysis", offsetStartMin: 25, durationMin: 5, step: "지식 엔터티 추출 완료" },
  ];

  const rows: Database["public"]["Tables"]["processing_jobs"]["Insert"][] = jobs.map((j) => {
    const startedAt = new Date(now.getTime() - j.offsetStartMin * 60_000);
    const completedAt = new Date(startedAt.getTime() + j.durationMin * 60_000);
    return {
      organization_id: organizationId,
      job_type: j.job_type,
      target_id: dataSourceId,
      status: "completed",
      progress: 100,
      current_step: j.step,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
    };
  });

  const { error } = await supabase.from("processing_jobs").insert(rows);
  if (error) {
    throw new Error(`processing_jobs 생성 실패: ${error.message}`);
  }
  log("처리 작업", `processing_jobs ${rows.length}건을 생성했습니다.`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== 인더업 시연 워크스페이스 시드 스크립트 시작 ===\n");

  const { id: organizationId, isNew } = await ensureOrganization();

  const demoUserId = await ensureDemoUser();
  await ensureOwnerMembership(organizationId, demoUserId);

  const entityMap = await upsertEntities(organizationId);
  await upsertDecisionRules(organizationId);
  await upsertBrandProfile(organizationId);
  await upsertPreferenceWeights(organizationId);

  const summary = {
    organizationId,
    isNew,
    entities: entityMap.size,
    decisionRules: 3,
    dataSources: 0,
    documentChunks: 0,
    campaigns: 0,
    strategyOptions: 0,
    contentOutputs: 0,
    performanceRecords: 0,
    learningEvents: 0,
    processingJobs: 0,
  };

  if (isNew) {
    await seedRelations(organizationId, entityMap);

    const { dataSourceId, chunkIds } = await seedDataSourceAndEvidence(organizationId, entityMap);
    summary.dataSources = 1;
    summary.documentChunks = chunkIds.length;

    const strategy = await seedCampaignAndStrategy(organizationId, entityMap, chunkIds);
    summary.campaigns = 1;
    summary.strategyOptions = strategy.allStrategyOptionIds.length;

    const contentOutputIds = await seedContentProjectAndOutputs(
      organizationId,
      strategy.campaignId,
      strategy.selectedStrategyOptionId
    );
    summary.contentOutputs = contentOutputIds.length;

    await seedPerformanceRecords(organizationId, contentOutputIds);
    summary.performanceRecords = Math.min(3, contentOutputIds.length);

    await seedLearningEvents(organizationId, strategy, contentOutputIds);
    summary.learningEvents = 4;

    await seedProcessingJobs(organizationId, dataSourceId);
    summary.processingJobs = 3;
  } else {
    log("요약", "기존 조직이 있어 캠페인/콘텐츠/성과 등 비-idempotent 데이터는 건너뛰었습니다.");
  }

  console.log("\n=== 시드 완료 요약 ===");
  console.log(`조직 ID: ${summary.organizationId} (${isNew ? "신규 생성" : "기존 재사용"})`);
  console.log(`데모 로그인: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
  console.log(`지식 엔터티: ${summary.entities}건`);
  console.log(`의사결정 규칙: ${summary.decisionRules}건`);
  console.log(`데이터 소스: ${summary.dataSources}건 / 문서 청크: ${summary.documentChunks}건`);
  console.log(`캠페인: ${summary.campaigns}건 / 전략 옵션: ${summary.strategyOptions}건`);
  console.log(`콘텐츠 결과물: ${summary.contentOutputs}건`);
  console.log(`성과 기록: ${summary.performanceRecords}건`);
  console.log(`학습 이벤트: ${summary.learningEvents}건`);
  console.log(`처리 작업 로그: ${summary.processingJobs}건`);
  console.log("\n완료되었습니다.");
}

main().catch((err) => {
  console.error("\n[시드 실패]", err instanceof Error ? err.message : err);
  process.exit(1);
});
