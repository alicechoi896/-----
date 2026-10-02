import { Brain, CalendarCheck, FileText, Film, MonitorPlay, Settings, ShieldCheck, Wrench } from "lucide-react";
import type { ChannelDef, StandalonePageDef } from "./types";

/**
 * 1차 메뉴(채널) 정의.
 * 새 채널 추가: 여기에 1개 추가 → app/<href>/page.tsx 에 <ChannelHub channelId="..."/> 작성.
 * 배열 순서 = 메인 카드, 사이드바 순서.
 */
export const CHANNELS: ChannelDef[] = [
  {
    id: "youtube",
    name: "YouTube",
    hubTitle: "YouTube 자동화",
    description: "영상 소재 조사부터 제목, 대본, 설명글, 키워드 생성까지",
    hubDescription: "트렌드를 찾고, 제품 홍보 영상과 정보성 영상의 원고를 만듭니다.",
    href: "/youtube",
    icon: MonitorPlay,
    accent: "youtube",
    showOnHome: true,
  },
  {
    id: "naver-clip",
    name: "NAVER 클립",
    hubTitle: "NAVER 클립 자동화",
    description: "네이버 검색 데이터를 활용한 클립 콘텐츠 제작 자동화",
    hubDescription: "네이버 검색·쇼핑 트렌드를 기반으로 숏폼 클립 원고를 만듭니다.",
    href: "/naver-clip",
    icon: Film,
    accent: "clip",
    showOnHome: true,
  },
  {
    id: "naver-blog",
    name: "NAVER 블로그",
    hubTitle: "NAVER 블로그 자동화",
    description: "키워드 조사부터 제품글·정보글 자동 작성까지",
    hubDescription: "키워드를 조사하고 제품 글, 정보 글, 자동 글쓰기로 블로그 원고를 만듭니다.",
    href: "/naver-blog",
    icon: FileText,
    accent: "blog",
    showOnHome: true,
  },
  {
    id: "tools",
    name: "공통 도구",
    hubTitle: "공통 도구",
    description: "제품 분석, 제품 라이브러리, 영상 자료 관리 등",
    hubDescription: "모든 채널에서 함께 쓰는 제품 데이터와 참고 자료를 관리합니다.",
    href: "/tools",
    icon: Wrench,
    accent: "tools",
    showOnHome: true,
  },
  {
    id: "settings",
    name: "설정",
    hubTitle: "설정",
    description: "API 연결 및 서비스 설정",
    hubDescription: "외부 API 연결과 서비스 환경을 관리합니다.",
    href: "/settings",
    icon: Settings,
    accent: "neutral",
    showOnHome: false,
  },
  {
    id: "admin",
    name: "사이트 관리",
    hubTitle: "사이트 관리",
    description: "사용자와 권한 관리 (관리자 전용)",
    hubDescription: "사용자 역할과 등급별 접근 권한을 관리합니다. 관리자에게만 보이는 메뉴입니다.",
    href: "/admin",
    icon: ShieldCheck,
    accent: "neutral",
    showOnHome: false,
    adminOnly: true,
  },
];

/** 채널에 속하지 않는 단독 페이지 */
export const STANDALONE_PAGES: StandalonePageDef[] = [
  {
    id: "ai-learning",
    title: "AI 학습 관리",
    description: "제품, 스타일, 히스토리, 피드백, 성과 데이터를 관리합니다. 생성할 때마다 이 데이터가 Context로 쓰입니다.",
    href: "/ai-learning",
    icon: Brain,
    defaultTiers: ["silver", "gold", "vip"],
  },
  {
    id: "uploads",
    title: "업로드 관리",
    description: "언제, 어느 채널에, 어떤 제품의 콘텐츠를 올렸는지 기록하고 월별 캘린더로 팀 전체 업로드 현황을 봅니다.",
    href: "/uploads",
    icon: CalendarCheck,
    defaultTiers: ["silver", "gold", "vip"],
  },
];
