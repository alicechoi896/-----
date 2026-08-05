import {
  Home,
  Briefcase,
  FlaskConical,
  LayoutGrid,
  TrendingUp,
  Radar,
  UploadCloud,
  Sparkles,
  Cpu,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { RouteAudience } from "./route-access";
import type { ScreenMode } from "./screen-mode";

export interface MenuChild {
  id: string;
  label: string;
  route: string;
  audience: RouteAudience;
}

export interface MenuItem {
  id: string;
  label: string;
  route: string;
  icon: LucideIcon;
  audience: RouteAudience;
  /** Which sidebar tree this item renders in — see lib/access/route-access.ts for the actual permission check. */
  mode: ScreenMode;
  /** Role required to even see this item, independent of the current screen mode. Undefined = no extra requirement beyond audience. */
  requiredPermission?: "owner";
  children?: MenuChild[];
  displayOrder: number;
}

// ---------------------------------------------------------------------------
// 일반 사용자 모드 (5개 중심 메뉴)
// ---------------------------------------------------------------------------

const USER_MENU_ITEMS: MenuItem[] = [
  {
    id: "home",
    label: "홈",
    route: "/dashboard",
    icon: Home,
    audience: "shared",
    mode: "user",
    displayOrder: 1,
  },
  {
    id: "my-business",
    label: "내 비즈니스",
    route: "/learning",
    icon: Briefcase,
    audience: "shared",
    mode: "user",
    displayOrder: 2,
    children: [
      { id: "my-business-register", label: "회사·상품 자료 등록", route: "/learning", audience: "shared" },
      { id: "my-business-sources", label: "등록 자료 관리", route: "/learning?tab=list", audience: "shared" },
      { id: "my-business-brand", label: "내 브랜드 정보", route: "/brain?tab=dna", audience: "shared" },
      { id: "my-business-quality", label: "AI 분석 결과 확인", route: "/learning?tab=quality", audience: "shared" },
    ],
  },
  {
    id: "campaign-strategy",
    label: "캠페인 전략",
    route: "/strategy",
    icon: FlaskConical,
    audience: "shared",
    mode: "user",
    displayOrder: 3,
  },
  {
    id: "content",
    label: "콘텐츠",
    route: "/orchestrator",
    icon: LayoutGrid,
    audience: "shared",
    mode: "user",
    displayOrder: 4,
    children: [
      { id: "content-create", label: "콘텐츠 만들기", route: "/orchestrator", audience: "shared" },
      { id: "content-publish", label: "발행·자동화", route: "/workflow", audience: "shared" },
    ],
  },
  {
    id: "performance",
    label: "성과",
    route: "/performance",
    icon: TrendingUp,
    audience: "shared",
    mode: "user",
    displayOrder: 5,
  },
];

// ---------------------------------------------------------------------------
// 관리자·기술 시연 모드 (6개 그룹)
// ---------------------------------------------------------------------------

const TECHNICAL_MENU_ITEMS: MenuItem[] = [
  {
    id: "tech-dashboard",
    label: "기술 대시보드",
    route: "/dashboard",
    icon: Radar,
    audience: "shared",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 1,
  },
  {
    id: "tech-data",
    label: "AI 데이터 관리",
    route: "/learning",
    icon: UploadCloud,
    audience: "shared",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 2,
    children: [
      { id: "tech-data-register", label: "데이터 등록", route: "/learning", audience: "shared" },
      { id: "tech-data-reference", label: "참조 콘텐츠 분석", route: "/learning?tab=reference", audience: "technical" },
      { id: "tech-data-list", label: "데이터 목록", route: "/learning?tab=list", audience: "shared" },
      { id: "tech-data-pipeline", label: "분석 파이프라인", route: "/learning?tab=pipeline", audience: "technical" },
      { id: "tech-data-quality", label: "데이터 품질관리", route: "/learning?tab=quality", audience: "shared" },
    ],
  },
  {
    id: "tech-brain",
    label: "AI 판단 구조",
    route: "/brain",
    icon: Sparkles,
    audience: "shared",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 3,
    children: [
      { id: "tech-brain-dna", label: "기업 DNA", route: "/brain?tab=dna", audience: "shared" },
      { id: "tech-brain-problem", label: "고객 문제지도", route: "/brain?tab=problem-map", audience: "technical" },
      { id: "tech-brain-expert", label: "전문가 사고지도", route: "/brain?tab=expert-map", audience: "technical" },
      { id: "tech-brain-graph", label: "지식그래프", route: "/brain?tab=graph", audience: "technical" },
      { id: "tech-brain-rules", label: "의사결정 규칙", route: "/brain?tab=rules", audience: "technical" },
    ],
  },
  {
    id: "tech-strategy-content",
    label: "전략 및 콘텐츠 테스트",
    route: "/strategy",
    icon: FlaskConical,
    audience: "shared",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 4,
    children: [
      { id: "tech-strategy", label: "전략 시뮬레이터", route: "/strategy", audience: "shared" },
      { id: "tech-orchestrator", label: "콘텐츠 오케스트레이터", route: "/orchestrator", audience: "shared" },
      { id: "tech-workflow", label: "자동화 워크플로우", route: "/workflow", audience: "shared" },
    ],
  },
  {
    id: "tech-performance",
    label: "성과 학습 관리",
    route: "/performance",
    icon: TrendingUp,
    audience: "shared",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 5,
    children: [
      { id: "tech-perf-overview", label: "성과 데이터", route: "/performance", audience: "shared" },
      { id: "tech-perf-ai", label: "전략별 실제 성과", route: "/performance?tab=ai-analysis", audience: "shared" },
      { id: "tech-perf-rule-update", label: "규칙 적용 기록", route: "/performance?tab=rule-update", audience: "technical" },
      { id: "tech-perf-before-after", label: "규칙 변경 내역", route: "/performance?tab=before-after", audience: "technical" },
      { id: "tech-perf-history", label: "다음 추천 반영 결과", route: "/performance?tab=brain-history", audience: "technical" },
    ],
  },
  {
    id: "tech-report",
    label: "기술 리포트",
    route: "/technology",
    icon: Cpu,
    audience: "technical",
    mode: "technical",
    requiredPermission: "owner",
    displayOrder: 6,
  },
];

export const MENU_ITEMS: MenuItem[] = [...USER_MENU_ITEMS, ...TECHNICAL_MENU_ITEMS];

export const SETTINGS_ITEM = {
  id: "settings",
  label: "설정",
  route: "/settings",
  icon: Settings,
} as const;

export function getMenuForMode(mode: ScreenMode): MenuItem[] {
  return MENU_ITEMS.filter((item) => item.mode === mode).sort((a, b) => a.displayOrder - b.displayOrder);
}
