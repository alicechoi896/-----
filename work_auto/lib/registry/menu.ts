import { BookOpen, Boxes, Brain, Clapperboard, FileText, Images, LineChart, Package, PenLine, Search, Settings2, Upload, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 왼쪽 메뉴 (v0.9.197) — 플랫폼별(유튜브·클립·블로그·인스타…)이 아니라 일하는 순서대로 6묶음.
 * 기능(FEATURES)·주소·권한·channelId 는 하나도 바꾸지 않는다 (channelId 는 원고가 유튜브용인지 클립용인지 같은 실제 동작에도 쓰임).
 * 같은 일을 하는 화면이 플랫폼마다 따로 있으면(원고·트렌드·원고로 영상 만들기) 메뉴는 하나로 두고, 그 화면 위쪽 탭으로 오간다.
 * 메뉴에 없는 기능이 생기면 tests/unit/menu.test.ts 가 알려 준다 (기능이 메뉴에서 사라지지 않게).
 */
export interface MenuTab {
  /** 기능 id (FEATURES) 또는 단독 페이지 id (STANDALONE_PAGES) */
  id: string;
  label: string;
}
export interface MenuItem {
  /** 메뉴 고유 id */
  id: string;
  title: string;
  icon: LucideIcon;
  /** 누르면 갈 곳 */
  href: string;
  /** 이 메뉴가 묶는 기능·단독 페이지 (첫 번째가 기본). 2개 이상이면 그 화면 위쪽에 탭 */
  tabs: MenuTab[];
}
export interface MenuGroup {
  id: string;
  label: string;
  items: MenuItem[];
  adminOnly?: boolean;
}

export const MENU: MenuGroup[] = [
  {
    id: "find",
    label: "① 찾기",
    items: [
      {
        id: "m-trends",
        title: "트렌드 찾기",
        icon: Search,
        href: "/youtube/trends",
        tabs: [
          { id: "yt-trends", label: "유튜브" },
          { id: "clip-trends", label: "네이버 클립" },
          { id: "blog-trends", label: "네이버 블로그 키워드" },
          { id: "ig-trends", label: "인스타그램 · 릴스 읽기" },
        ],
      },
      { id: "m-scraps", title: "트렌드 스크랩", icon: BookOpen, href: "/scraps", tabs: [{ id: "scraps", label: "트렌드 스크랩" }] },
    ],
  },
  {
    id: "source",
    label: "② 제품·소재",
    items: [
      { id: "m-library", title: "제품 라이브러리", icon: Package, href: "/tools/product-library", tabs: [{ id: "product-library", label: "제품 라이브러리" }] },
      { id: "m-learning", title: "제품 상세페이지 학습", icon: Brain, href: "/tools/product-learning", tabs: [{ id: "product-learning", label: "제품 상세페이지 학습" }] },
      { id: "m-import", title: "영상 URL 가져오기", icon: Boxes, href: "/tools/video-import", tabs: [{ id: "video-import", label: "영상 URL 가져오기" }] },
    ],
  },
  {
    id: "make-text",
    label: "③ 만들기 · 글·이미지",
    items: [
      {
        id: "m-script",
        title: "영상 원고",
        icon: PenLine,
        href: "/youtube/product-video",
        tabs: [
          { id: "yt-product-video", label: "유튜브 · 제품" },
          { id: "yt-info-video", label: "유튜브 · 정보성" },
          { id: "clip-product-content", label: "네이버 클립 · 제품" },
          { id: "clip-info-content", label: "네이버 클립 · 정보성" },
        ],
      },
      {
        id: "m-blog",
        title: "블로그 글",
        icon: FileText,
        href: "/naver-blog/product-writing",
        tabs: [
          { id: "blog-product-writing", label: "제품 블로그 글" },
          { id: "blog-info-writing", label: "정보·트렌드 글" },
          { id: "blog-auto-writing", label: "자동 글쓰기" },
        ],
      },
      { id: "m-carousel", title: "캐러셀", icon: Images, href: "/instagram/carousel", tabs: [{ id: "product-carousel", label: "캐러셀" }] },
      { id: "m-detail", title: "상세페이지 만들기", icon: FileText, href: "/tools/detail-page", tabs: [{ id: "detail-page", label: "상세페이지 만들기" }] },
    ],
  },
  {
    id: "make-video",
    label: "③ 만들기 · 영상",
    items: [
      {
        id: "m-video",
        title: "원고로 영상 만들기",
        icon: Clapperboard,
        href: "/youtube/video-production",
        tabs: [
          { id: "yt-video-production", label: "유튜브" },
          { id: "clip-video-production", label: "네이버 클립" },
        ],
      },
      { id: "m-auto", title: "제품 영상 자동 제작", icon: Video, href: "/youtube/auto-video", tabs: [{ id: "yt-auto-video", label: "제품 영상 자동 제작" }] },
      { id: "m-stay", title: "AI 숙소 영상", icon: Video, href: "/video/stay", tabs: [{ id: "ai-stay", label: "AI 숙소 영상" }] },
      { id: "m-fashion", title: "AI 패션 사진·영상", icon: Video, href: "/instagram/fashion", tabs: [{ id: "ig-fashion", label: "AI 패션 사진·영상" }] },
      { id: "m-makeup", title: "AI 메이크업", icon: Video, href: "/video/makeup", tabs: [{ id: "ai-makeup", label: "AI 메이크업" }] },
      { id: "m-drama", title: "AI 드라마 스튜디오", icon: Video, href: "/tools/drama-test", tabs: [{ id: "drama-test", label: "AI 드라마 스튜디오" }] },
      { id: "m-silence", title: "무음 구간 자르기", icon: Video, href: "/tools/silence-cut", tabs: [{ id: "silence-cut", label: "무음 구간 자르기" }] },
    ],
  },
  {
    id: "publish",
    label: "④ 올리기·성과",
    items: [
      { id: "m-uploads", title: "업로드 관리", icon: Upload, href: "/uploads", tabs: [{ id: "uploads", label: "업로드 관리" }] },
      { id: "m-analytics", title: "성과 분석", icon: LineChart, href: "/analytics", tabs: [{ id: "analytics", label: "성과 분석" }] },
    ],
  },
  {
    id: "settings",
    label: "⑤ 설정",
    items: [
      { id: "m-ai-learning", title: "AI 학습 관리", icon: Brain, href: "/ai-learning", tabs: [{ id: "ai-learning", label: "AI 학습 관리" }] },
      { id: "m-api", title: "API 연결 센터", icon: Settings2, href: "/settings/api", tabs: [{ id: "api-center", label: "API 연결 센터" }] },
      { id: "m-manual", title: "사용 매뉴얼", icon: BookOpen, href: "/manual", tabs: [{ id: "manual", label: "사용 매뉴얼" }] },
    ],
  },
];

/** 기능·단독 페이지 id → 그 메뉴 (탭이 여럿이면 화면 위쪽 탭) */
export function menuItemOf(id: string): { group: MenuGroup; item: MenuItem } | null {
  for (const group of MENU) for (const item of group.items) if (item.tabs.some((t) => t.id === id)) return { group, item };
  return null;
}
