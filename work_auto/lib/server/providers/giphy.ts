import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { nowIso } from "@/lib/utils";

/**
 * GIPHY (v0.9.102) — 영상 자동 제작의 주목 효과 GIF 검색. docs/VIDEO_PRODUCTION.md
 * - 검색: GET https://api.giphy.com/v1/{stickers|gifs}/search?api_key=&q=&limit=&rating=g&lang=ko (무료, 키마다 시간당 한도)
 * - 키는 서버에서만 쓰고(쿼리에 넣어야 하는 API) 로그·오류·화면에 넣지 않는다. 자동 재시도 없음.
 * - GIF 저작권은 원작자에게 있다: 화면에 'Powered by GIPHY' 와 주의 문구를 보여 준다.
 */
const API = "https://api.giphy.com/v1";
const TIMEOUT_MS = 15_000;

export interface GiphyItem {
  id: string;
  title: string;
  /** 렌더에 쓰는 GIF (2MB 안팎) */
  url: string;
  /** 화면 미리 보기 (작은 GIF) */
  preview: string;
  width: number;
  height: number;
}

type Obj = Record<string, unknown>;

/** GIPHY 파일 주소만 (media*.giphy.com, https) */
export const isGiphyUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)giphy\.com$/.test(x.hostname);
  } catch {
    return false;
  }
};

export function parseGiphy(body: Obj): GiphyItem[] {
  const list = Array.isArray(body.data) ? (body.data as Obj[]) : [];
  return list
    .map((d) => {
      const im = (d.images ?? {}) as Record<string, Obj | undefined>;
      const big = im.downsized ?? im.fixed_height ?? im.original;
      const small = im.fixed_height_small ?? im.fixed_width_small ?? im.fixed_height ?? big;
      return {
        id: String(d.id ?? ""),
        title: String(d.title ?? "").slice(0, 80),
        url: String(big?.url ?? ""),
        preview: String(small?.url ?? big?.url ?? ""),
        width: Number(big?.width) || 0,
        height: Number(big?.height) || 0,
      };
    })
    .filter((x) => x.id && isGiphyUrl(x.url) && isGiphyUrl(x.preview));
}

export class GiphyProvider {
  readonly id = "giphy";
  readonly label = "GIPHY";
  constructor(private readonly apiKey: string) {}

  private async get(path: string, params: Record<string, string>): Promise<Obj> {
    const q = new URLSearchParams({ ...params, api_key: this.apiKey });
    let res: Response;
    try {
      res = await fetch(`${API}${path}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch {
      throw new Error("GIPHY 응답이 오지 않았습니다. 잠시 후 다시 눌러 주세요.");
    }
    if (res.status === 401 || res.status === 403) throw new Error("GIPHY API Key 가 올바르지 않습니다. API 연결 센터에서 키를 확인해 주세요.");
    if (res.status === 429) throw new Error("GIPHY 검색 한도(시간당)를 넘었습니다. 잠시 후 다시 눌러 주세요.");
    if (!res.ok) throw new Error(`GIPHY 오류 (HTTP ${res.status}).`);
    return (await res.json()) as Obj;
  }

  /** 검색 1회 = 호출 1번 (무료). stickers = 배경이 투명한 GIF (영상 위에 얹기 좋음) */
  async search(query: string, type: "stickers" | "gifs" = "stickers", limit = 18): Promise<GiphyItem[]> {
    const body = await this.get(`/${type}/search`, { q: query.slice(0, 50), limit: String(Math.min(30, Math.max(1, limit))), rating: "g", lang: "ko" });
    return parseGiphy(body);
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const items = await this.search("wow", "stickers", 1);
      return { ok: true, message: `GIPHY 연결 확인 (검색 결과 ${items.length}개)`, testedAt: nowIso(), mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "연결을 확인하지 못했습니다.", testedAt: nowIso(), mock: false };
    }
  }
}

/** 데모: 외부 호출 없이 빈 결과 */
export class MockGiphyProvider {
  readonly id = "mock-giphy";
  async search(): Promise<GiphyItem[]> {
    return [];
  }
}
