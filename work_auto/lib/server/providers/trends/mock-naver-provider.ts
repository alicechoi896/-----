import "server-only";
import { buildNaverInsight } from "@/lib/mock/naver-trends";
import type { NaverTrendInsight, NaverTrendQuery } from "@/lib/types";
import { serverConfig } from "../../config";
import type { NaverTrendProvider } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockNaverTrendProvider implements NaverTrendProvider {
  readonly id = "mock-naver";
  readonly kind = "naver-trend" as const;
  readonly label = "NAVER (Mock)";

  async testConnection() {
    return { ok: true, message: "Mock NAVER 데이터를 사용합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  async getInsight(query: NaverTrendQuery): Promise<NaverTrendInsight> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.6));
    return buildNaverInsight(query, Date.now());
  }
}
