import "server-only";
import type { IgReel } from "@/lib/types/instagram";
import { tikhubRequest } from "../tikhub/client";
import { parseReelSearch, shapeOf } from "./parse";

/**
 * 인스타그램 릴스 검색 Provider (v0.9.53). 화면·서비스는 이 interface 만 쓴다.
 * TikHub Instagram V2 (공식 SDK V5.3.2 기준): GET /api/v1/instagram/v2/search_reels — keyword, pagination_token
 * 키는 TikHub(샤오홍슈·도우인과 같은 키). 서버에서만 쓰고 로그·오류에 남기지 않는다.
 */
export interface InstagramProvider {
  readonly id: string;
  searchReels(keyword: string, next?: string | null): Promise<{ items: IgReel[]; next: string | null; shape?: string }>;
  /** 릴스 1개 (재생 주소가 검색 결과에 없을 때만) — GET /api/v1/instagram/v2/fetch_post_info?code_or_url= */
  fetchReel(code: string): Promise<IgReel | null>;
}

export class TikHubInstagramProvider implements InstagramProvider {
  readonly id = "tikhub-instagram";
  constructor(private readonly apiKey: string) {}
  async searchReels(keyword: string, next?: string | null) {
    const body = await tikhubRequest(this.apiKey, "GET", "/api/v1/instagram/v2/search_reels", { keyword, pagination_token: next ?? undefined });
    return { ...parseReelSearch(body), shape: shapeOf(body) };
  }
  async fetchReel(code: string) {
    const body = await tikhubRequest(this.apiKey, "GET", "/api/v1/instagram/v2/fetch_post_info", { code_or_url: code });
    return parseReelSearch(body).items.find((r) => r.code === code) ?? parseReelSearch({ data: { items: [body.data] } }).items[0] ?? null;
  }
}

/** 데모: 가짜 릴스 (주소·숫자는 예시) */
export class MockInstagramProvider implements InstagramProvider {
  readonly id = "mock-instagram";
  async searchReels(keyword: string, next?: string | null) {
    const page = next ? Number(next) || 1 : 0;
    const now = Date.now();
    const items: IgReel[] = Array.from({ length: 12 }, (_, i) => {
      const k = page * 12 + i;
      const plays = Math.round(2_000_000 / (k + 1.5));
      return {
        code: `DEMO${String(k).padStart(4, "0")}${keyword.length}`,
        url: `https://www.instagram.com/reel/DEMO${String(k).padStart(4, "0")}/`,
        caption: `${keyword} ${["사기 전에 꼭 볼 3가지", "이거 하나로 끝", "솔직 후기", "가성비 끝판왕", "모르면 손해"][k % 5]} #${keyword.replace(/\s+/g, "")} #추천 #꿀템`,
        hashtags: [keyword.replace(/\s+/g, ""), "추천", "꿀템"],
        author: `demo_creator${k % 6}`,
        followers: 10_000 + ((k * 7919) % 200_000),
        plays,
        likes: Math.round(plays * 0.04),
        comments: Math.round(plays * 0.002),
        postedAt: new Date(now - (k + 1) * 86_400_000 * 1.7).toISOString(),
        thumbnailUrl: null,
        durationSec: 15 + (k % 4) * 10,
      };
    });
    return { items, next: page < 2 ? String(page + 1) : null };
  }
  async fetchReel() {
    return null; // 데모: 재생 주소 없음
  }
}
