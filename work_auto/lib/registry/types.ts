import type { LucideIcon } from "lucide-react";
import type { ChannelId, FeatureStatus, MemberTier, ProviderId } from "@/lib/types";

/** Registry 에서 기능을 묶는 단위. 채널 4개 + 설정 허브 + 사이트 관리(관리자 전용) */
export type HubId = ChannelId | "settings" | "admin";

/** 아이콘 칩 포인트 컬러 (globals.css 의 --color-ch-* 토큰과 1:1) */
export type AccentColor = "youtube" | "clip" | "blog" | "instagram" | "tools" | "neutral";

export interface ChannelDef {
  id: HubId;
  /** 메뉴와 카드에 쓰는 이름 */
  name: string;
  /** 2차 메뉴 페이지 제목 (예: "YouTube 자동화") */
  hubTitle: string;
  /** 메인 카드 한 줄 설명 */
  description: string;
  /** 2차 메뉴 페이지 설명 */
  hubDescription: string;
  href: string;
  icon: LucideIcon;
  accent: AccentColor;
  /** 메인(1차) 화면 채널 카드로 노출할지 여부 */
  showOnHome: boolean;
  /** 관리자에게만 보이는 허브 (사이트 관리) */
  adminOnly?: boolean;
}

/**
 * 기능 종류
 * - trend: 데이터 조회·탐색형 (필터 + 표/차트)
 * - generator: AI 생성형 (ContentGenerator + Generator Config)
 * - tool: 데이터 관리형 (제품 학습, 라이브러리 등)
 * - settings: 설정
 * - admin: 사이트 관리 (관리자 전용)
 */
export type FeatureKind = "trend" | "generator" | "tool" | "settings" | "admin";

export interface FeatureDef {
  /** 전역 고유 ID. Generator Config, Prompt, 생성 이력, 권한의 키로 쓴다. 바꾸지 않는다. */
  id: string;
  channelId: HubId;
  /** 채널 안에서의 표시 순서 (카드의 "01" 번호) */
  order: number;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  kind: FeatureKind;
  status: FeatureStatus;
  /** 실제 동작에 필요한 외부 API. 현재 Mock 이어도 실제 연동 시 필요한 것을 적는다 */
  requiredProviders: ProviderId[];
  inputs: string[];
  outputs: string[];
  /**
   * 기본 접근 등급. 관리자는 항상 접근할 수 있으므로 적지 않는다.
   * "사이트 관리 → 권한 관리"에서 바꾸면 그 값이 우선한다 (DB 에 저장).
   * 새 기능을 추가할 때 반드시 정한다.
   */
  defaultTiers: MemberTier[];
  /** 관리자 전용 (권한 관리 대상에서 제외) */
  adminOnly?: boolean;
  /** 카드에 보조로 표시할 태그 */
  tags?: string[];
}

/** 채널에 속하지 않는 단독 페이지 (사이드바 노출용) */
export interface StandalonePageDef {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  defaultTiers: MemberTier[];
}
