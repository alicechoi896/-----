import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { douyinVideoUrl, type DouyinProvider, type DouyinSearchPage, type DouyinSearchParams, type DouyinVideo } from "./types";

/** 데모 모드용 가짜 도우인 (외부 호출 없음). 검색어에 "적음" 이 들어가면 결과를 적게 돌려준다 (보조 검색 시험용) */
export class MockDouyinProvider implements DouyinProvider {
  readonly id = "mock-douyin";
  readonly label = "데모 도우인";

  async searchVideos(p: DouyinSearchParams): Promise<DouyinSearchPage> {
    const now = Date.now();
    const seed = [...p.keyword].reduce((s, c) => s + c.charCodeAt(0), 0);
    const few = /少|적음/.test(p.keyword);
    const n = few ? 4 : 12;
    const angles = ["真实测评", "开箱", "避坑", "使用一个月", "性价比", "对比", "好物推荐", "清洁技巧", "值得买吗", "租房好物", "宿舍必备", "保姆级教程"];
    const videos: DouyinVideo[] = Array.from({ length: n }, (_, i) => {
      const k = p.cursor + i;
      const awemeId = `74${String(seed % 1_000_000).padStart(6, "0")}${String(k).padStart(11, "0")}`;
      const days = (k * 2 + (seed % 7)) % 45;
      return {
        awemeId,
        title: `${p.keyword} ${angles[k % angles.length]}`,
        desc: `${p.keyword} ${angles[k % angles.length]} #好物推荐`,
        author: `抖音用户${(seed + k) % 9000 + 1000}`,
        coverUrl: null,
        shareUrl: douyinVideoUrl(awemeId),
        publishedAt: new Date(now - days * 86_400_000).toISOString(),
        durationSec: 12 + ((seed + k * 5) % 70),
        likes: ((seed * (k + 2)) % 50_000) + 300,
        comments: ((seed + k * 17) % 2000) + 10,
        collects: ((seed * (k + 4)) % 8000) + 50,
        shares: ((seed + k * 3) % 3000) + 5,
        playUrls: [],
      };
    });
    return { videos, rawCount: n, cursor: p.cursor + n, searchId: "demo", backtrace: "demo", hasMore: !few && p.cursor < 24 };
  }

  async resolveShareUrl(shareUrl: string): Promise<DouyinVideo | null> {
    const id = shareUrl.match(/video\/(\d{8,25})/)?.[1] ?? "7400000000000000001";
    return {
      awemeId: id,
      title: "도우인 데모 영상",
      desc: null,
      author: "抖音用户",
      coverUrl: null,
      shareUrl,
      publishedAt: new Date().toISOString(),
      durationSec: 30,
      likes: null,
      comments: null,
      collects: null,
      shares: null,
      playUrls: [], // 데모: 받을 영상이 없다
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, message: "데모 모드: 실제 TikHub 호출 없이 형식만 확인했습니다.", testedAt: new Date().toISOString(), mock: true };
  }
}
