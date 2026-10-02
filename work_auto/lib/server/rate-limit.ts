import "server-only";
import { AppError } from "./http";
import { getCurrentUserId } from "./repositories";

/**
 * 사용자별 호출 횟수 제한 (1분 창).
 *
 * 왜 필요한가: 샤오홍슈·NAVER 자동완성처럼 "우리 서버 IP 로" 부르는 외부 서비스는
 * 한 사람이 버튼을 마구 눌러도 서버 IP 전체가 막힐 수 있다 → 모든 사용자가 같이 피해를 본다.
 * AI 호출은 각자 키를 쓰지만, 실수로 반복 호출해 비용이 새는 것도 막는다.
 *
 * 서버 인스턴스마다 따로 세는 간단한 방식이다 (Vercel 은 인스턴스가 여러 개일 수 있어 엄격한 한도는 아님).
 * 사용자가 많아지면 DB·Redis 기반으로 바꾼다 (docs/OPERATIONS.md).
 */
export const LIMITS = {
  "xhs-resolve": 20, // 샤오홍슈 영상 주소 찾기 (서버 IP 공유 → 가장 보수적으로)
  "video-import": 10, // 영상 여러 개 가져오기 (한 번에 최대 20개)
  "detect-text": 12, // 글자 위치 찾기 (영상 1개 = 3번 호출)
  "describe-photos": 10,
  "style-import": 20, // 나의 스타일 파일 일괄 추가 미리보기 (파일 파싱만, 외부 호출 없음)
  "ai-generate": 20, // 콘텐츠 생성·분석·주제 추천 등 AI 호출
  "product-analyze": 10,
  "product-images": 40, // 상세페이지 이미지 조각 읽기 (긴 페이지는 여러 번)
  "trends-youtube": 30, // 각자 YouTube 할당량을 쓰지만 반복 조회 방지
  "trends-naver": 20, // 데이터랩 + 자동완성(서버 IP 공유)
} as const;

export type LimitName = keyof typeof LIMITS;

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export async function rateLimit(name: LimitName): Promise<void> {
  const userId = await getCurrentUserId();
  const key = `${name}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[name]) {
    const wait = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    throw new AppError("RATE_LIMIT", `요청이 너무 많습니다. ${wait}초 뒤에 다시 시도해 주세요.`, 429);
  }
  recent.push(now);
  hits.set(key, recent);
  // 오래된 기록 정리 (메모리가 늘지 않게)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
}
