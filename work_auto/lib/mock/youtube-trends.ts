import type { YouTubeTrendItem } from "@/lib/types";
import { calcTrendScore } from "@/lib/domain/trend-score";
import { seededNumber } from "@/lib/utils";

/**
 * YouTube 트렌드 Mock 원본.
 * 실제 연동 시 YouTube Data API(search.list + videos.list + channels.list) 결과를 같은 형태로 변환한다.
 * ageDays: 게시 후 경과 일수, views: 누적 조회수
 */
interface Seed {
  title: string;
  channelName: string;
  subs: number;
  category: string;
  keywords: string[];
  format: "shorts" | "long";
  ageDays: number;
  views: number;
  durationSec: number;
}

const SEEDS: Seed[] = [
  { title: "자취방 청소 10분 루틴, 무선청소기 하나로 끝", channelName: "혼살림 연구소", subs: 48_000, category: "생활/주방", keywords: ["자취", "무선청소기", "청소 루틴"], format: "shorts", ageDays: 2, views: 612_000, durationSec: 48 },
  { title: "에어프라이어 오븐형 vs 바스켓형, 1년 쓰면 차이 나는 것", channelName: "주방실험실", subs: 210_000, category: "생활/주방", keywords: ["에어프라이어", "오븐형", "비교"], format: "long", ageDays: 5, views: 384_000, durationSec: 742 },
  { title: "2026 하반기 꼭 알아야 할 AI 툴 7가지", channelName: "테크한입", subs: 520_000, category: "IT/가전", keywords: ["AI 툴", "생산성", "2026"], format: "long", ageDays: 3, views: 921_000, durationSec: 1104 },
  { title: "직장인 거북목, 퇴근길 5분 스트레칭", channelName: "바른자세 코치", subs: 33_000, category: "건강/식품", keywords: ["거북목", "스트레칭", "직장인"], format: "shorts", ageDays: 1, views: 287_000, durationSec: 55 },
  { title: "미니 마사지건 3종 소음 비교 (사무실에서 써도 될까?)", channelName: "리뷰하는 김대리", subs: 92_000, category: "건강/식품", keywords: ["마사지건", "저소음", "사무실"], format: "long", ageDays: 6, views: 143_000, durationSec: 528 },
  { title: "월급 300 사회초년생 통장 쪼개기 현실 버전", channelName: "머니로그", subs: 760_000, category: "재테크", keywords: ["통장 쪼개기", "사회초년생", "재테크"], format: "long", ageDays: 9, views: 1_240_000, durationSec: 913 },
  { title: "겨울 난방비 반으로 줄이는 생활 습관 6가지", channelName: "살림의 정석", subs: 154_000, category: "생활/주방", keywords: ["난방비", "절약", "겨울"], format: "long", ageDays: 4, views: 452_000, durationSec: 631 },
  { title: "다이소 신상 주방템 솔직 정리", channelName: "생활꿀팁 TV", subs: 380_000, category: "생활/주방", keywords: ["다이소", "주방템", "신상"], format: "shorts", ageDays: 2, views: 803_000, durationSec: 58 },
  { title: "아이폰 숨은 기능 12개, 아직도 모르면 손해", channelName: "테크한입", subs: 520_000, category: "IT/가전", keywords: ["아이폰", "숨은 기능", "꿀팁"], format: "long", ageDays: 12, views: 1_510_000, durationSec: 802 },
  { title: "강아지 겨울 산책, 이것만은 꼭 챙기세요", channelName: "멍멍생활", subs: 27_000, category: "반려동물", keywords: ["강아지", "겨울 산책", "반려견"], format: "shorts", ageDays: 3, views: 198_000, durationSec: 41 },
  { title: "보온 텀블러 6개 24시간 얼음 테스트", channelName: "실험하는 남자", subs: 118_000, category: "생활/주방", keywords: ["텀블러", "보냉", "테스트"], format: "long", ageDays: 8, views: 336_000, durationSec: 687 },
  { title: "육아템 중 진짜 잘 산 것 vs 후회한 것", channelName: "초보엄마 일기", subs: 64_000, category: "육아", keywords: ["육아템", "출산준비", "후회템"], format: "long", ageDays: 10, views: 275_000, durationSec: 954 },
  { title: "제주 3박4일 20만원 여행 코스", channelName: "가성비 여행러", subs: 89_000, category: "여행", keywords: ["제주 여행", "가성비", "코스"], format: "long", ageDays: 15, views: 402_000, durationSec: 1210 },
  { title: "ChatGPT로 블로그 글 30분 만에 쓰는 법", channelName: "AI 실무 연구소", subs: 141_000, category: "IT/가전", keywords: ["ChatGPT", "블로그", "AI 글쓰기"], format: "long", ageDays: 6, views: 517_000, durationSec: 875 },
  { title: "아침 공복 습관 하나 바꿨더니 생긴 변화", channelName: "건강한 하루", subs: 205_000, category: "건강/식품", keywords: ["공복", "아침 습관", "건강"], format: "shorts", ageDays: 5, views: 690_000, durationSec: 52 },
  { title: "책상 정리템 5개로 작업 효율 올리기", channelName: "데스크셋업", subs: 41_000, category: "자기계발", keywords: ["책상 정리", "데스크테리어", "작업 효율"], format: "shorts", ageDays: 4, views: 233_000, durationSec: 59 },
  { title: "고양이가 좋아하는 장난감 실험 TOP5", channelName: "냥이네 집", subs: 312_000, category: "반려동물", keywords: ["고양이", "장난감", "실험"], format: "long", ageDays: 18, views: 588_000, durationSec: 498 },
  { title: "ETF 처음 시작할 때 꼭 알아야 할 5가지", channelName: "머니로그", subs: 760_000, category: "재테크", keywords: ["ETF", "투자 입문", "재테크"], format: "long", ageDays: 13, views: 870_000, durationSec: 1022 },
  { title: "30초 만에 끝내는 셔츠 다림질", channelName: "살림의 정석", subs: 154_000, category: "생활/주방", keywords: ["다림질", "살림 꿀팁", "셔츠"], format: "shorts", ageDays: 7, views: 512_000, durationSec: 33 },
  { title: "선크림 성분표 보는 법, 이 성분은 피하세요", channelName: "성분 읽어주는 언니", subs: 176_000, category: "뷰티", keywords: ["선크림", "성분", "피부"], format: "long", ageDays: 11, views: 344_000, durationSec: 716 },
  { title: "노트북 추천 2026 하반기 가격대별 정리", channelName: "테크한입", subs: 520_000, category: "IT/가전", keywords: ["노트북 추천", "가성비 노트북", "2026"], format: "long", ageDays: 16, views: 1_020_000, durationSec: 1388 },
  { title: "자취생 냉장고 파먹기 일주일 식단", channelName: "혼살림 연구소", subs: 48_000, category: "생활/주방", keywords: ["자취 요리", "냉파", "식단"], format: "long", ageDays: 19, views: 158_000, durationSec: 845 },
  { title: "하루 10분 영어 쉐도잉 루틴", channelName: "출근길 영어", subs: 95_000, category: "자기계발", keywords: ["영어 공부", "쉐도잉", "루틴"], format: "shorts", ageDays: 1, views: 121_000, durationSec: 57 },
  { title: "에어프라이어 통닭 실패 없는 온도와 시간", channelName: "주방실험실", subs: 210_000, category: "생활/주방", keywords: ["에어프라이어", "통닭", "레시피"], format: "shorts", ageDays: 3, views: 433_000, durationSec: 46 },
];

const THUMB_COLORS = ["#dbe4ff", "#ffe3e3", "#d3f9d8", "#fff3bf", "#e5dbff", "#c5f6fa", "#ffe8cc", "#f1f3f5"];

/** Mock 카테고리 → YouTube 공식 카테고리 ID */
const CATEGORY_ID: Record<string, string> = {
  "생활/주방": "26",
  "IT/가전": "28",
  "건강/식품": "26",
  재테크: "27",
  반려동물: "15",
  육아: "22",
  여행: "19",
  뷰티: "26",
  자기계발: "27",
};

/** 기준 시각을 받아 YouTubeTrendItem 목록을 만든다 (Mock Provider 가 호출) */
export function buildYouTubeTrendItems(now: number, periodDays: number): (YouTubeTrendItem & { categoryId: string })[] {
  return SEEDS.map((s, i) => {
    const viewsPerDay = Math.round(s.views / Math.max(s.ageDays, 1));
    const id = `yt_mock${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      source: "youtube",
      videoId: `mock${String(i + 1).padStart(3, "0")}`,
      url: `https://www.youtube.com/watch?v=mock${i + 1}`,
      title: s.title,
      channelId: `mockch${seededNumber(s.channelName, 1000, 9999)}`,
      channelName: s.channelName,
      channelSubscribers: s.subs,
      thumbnailColor: THUMB_COLORS[i % THUMB_COLORS.length],
      category: s.category,
      categoryId: CATEGORY_ID[s.category] ?? "22",
      keywords: s.keywords,
      tags: [...new Set([...s.keywords, s.category.split("/")[0], `${s.keywords[0]} 추천`, `${s.keywords[0]} 꿀팁`])],
      description: `${s.title}. (데모용 예시 영상입니다)`,
      country: "KR",
      format: s.format,
      durationSec: s.durationSec,
      views: s.views,
      viewsPerDay,
      commentCount: Math.round(s.views * (seededNumber(s.title + "c", 2, 12) / 1000)),
      likeCount: Math.round(s.views * (seededNumber(s.title + "l", 15, 45) / 1000)),
      publishedAt: new Date(now - s.ageDays * 86_400_000).toISOString(),
      collectedAt: new Date(now).toISOString(),
      trendScore: calcTrendScore({
        views: s.views,
        viewsPerDay,
        channelSubscribers: s.subs,
        ageDays: s.ageDays,
        periodDays,
      }),
    };
  });
}
