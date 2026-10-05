import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { xhsNoteUrl, type XhsNote, type XhsSearchPage, type XhsSearchParams, type XiaohongshuSearchProvider } from "./types";

/** 데모 모드용 가짜 검색 결과 (외부 호출 없음). 노트 ID 는 검색어로 만든 가짜 값이라 가져오기는 실패할 수 있다 */
export class MockXiaohongshuProvider implements XiaohongshuSearchProvider {
  readonly id = "mock-xiaohongshu";
  readonly label = "데모 샤오홍슈";

  async searchVideos(p: XhsSearchParams): Promise<XhsSearchPage> {
    const now = Date.now();
    const seed = [...p.keyword].reduce((s, c) => s + c.charCodeAt(0), 0);
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
    const angles = ["真实测评", "避坑指南", "开箱", "一周使用感受", "平价替代", "对比", "好物分享", "使用技巧", "值不值得买", "租房必备"];
    const notes: XhsNote[] = Array.from({ length: 10 }, (_, i) => {
      const k = (p.page - 1) * 10 + i;
      const noteId = (hex(seed * 7919 + k) + hex(k * 104729 + 17) + hex(seed + k * 31)).slice(0, 24);
      const days = (k * 3 + (seed % 5)) % 40;
      return {
        noteId,
        xsecToken: `demo${hex(k)}`,
        url: xhsNoteUrl(noteId, `demo${hex(k)}`),
        title: `${p.keyword} ${angles[k % angles.length]}`,
        desc: `${p.keyword} 데모 설명 ${k + 1}`,
        author: `小红薯${(seed + k) % 900 + 100}`,
        coverUrl: null,
        publishedAt: new Date(now - days * 86_400_000).toISOString(),
        likes: ((seed * (k + 3)) % 9000) + 120,
        comments: ((seed + k * 13) % 400) + 5,
        collects: ((seed * (k + 1)) % 3000) + 40,
        durationSec: 15 + ((seed + k * 7) % 80),
      };
    });
    const sorted = [...notes].sort((a, b) =>
      p.sort === "latest" ? b.publishedAt!.localeCompare(a.publishedAt!) : p.sort === "likes" ? b.likes! - a.likes! : p.sort === "comments" ? b.comments! - a.comments! : p.sort === "collects" ? b.collects! - a.collects! : 0,
    );
    return { notes: sorted, rawCount: 10, searchId: "demo", sessionId: "demo", hasMore: p.page < 3 };
  }

  async getVideoDetail(): Promise<XhsNote | null> {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, message: "데모 모드: 실제 TikHub 호출 없이 형식만 확인했습니다.", testedAt: new Date().toISOString(), mock: true };
  }
}
