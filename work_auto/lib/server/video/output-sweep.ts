import "server-only";
import { videoStorage } from "./storage";

/**
 * v0.9.188 다른 기능의 완성 결과물 자동 삭제 — 만든 지 3일 지나면 지운다 (이미 받아 갔으니 남길 필요 없음, Supabase 저장 공간).
 * 결과물만 지운다: 사진·룩 이미지·업로드한 원본·프로젝트 설정(json)은 그대로 → 필요하면 다시 만들 수 있다.
 *  - AI 패션: {owner}/fashion/{id}/out/* (피드 PNG·릴스 MP4)
 *  - AI 드라마: {owner}/drama/{id}/render/* (완성 MP4)
 *  - AI 메이크업: {owner}/multicam/{id}/result_*·input_* (완성·중간 MP4)
 *  - 캐러셀: {owner}/carousel/{id}/slide_* (완성 PNG)
 *  - 상세페이지: {owner}/detail/{id}/s01_*·full_* (완성 PNG·JPG)
 * 원고로 영상 만들기·제품 영상 자동 제작·숙소 영상 완성본은 videoJobService.cleanup (받은 뒤 1시간·7일).
 */
export const OUTPUT_KEEP_DAYS = 3;

const TARGETS: { root: string; sub: string | null; match: RegExp }[] = [
  { root: "fashion", sub: "out", match: /./ },
  { root: "drama", sub: "render", match: /\.mp4$/i },
  { root: "multicam", sub: null, match: /^(result|input)_.*\.mp4$/i },
  { root: "carousel", sub: null, match: /^slide_.*\.png$/i },
  { root: "detail", sub: null, match: /^(s\d{2}_.*\.png|full_.*\.jpg)$/i },
];

/** 한 번에 너무 오래 걸리지 않게 프로젝트 200개·파일 1000개까지 (다음 정리 때 이어서) */
export async function sweepOutputs(owner: string, days = OUTPUT_KEEP_DAYS): Promise<{ removed: number; bytes: number }> {
  const maxAge = days * 24 * 60 * 60 * 1000;
  let removed = 0;
  let bytes = 0;
  for (const t of TARGETS) {
    const ids = await videoStorage.folders(`${owner}/${t.root}`, { limit: 200 }).catch(() => [] as string[]);
    for (const id of ids) {
      if (removed >= 1000) break;
      const dir = t.sub ? `${owner}/${t.root}/${id}/${t.sub}` : `${owner}/${t.root}/${id}`;
      const files = await videoStorage.list(dir, { limit: 500 }).catch(() => []);
      for (const f of files) {
        const name = f.key.slice(dir.length + 1);
        const at = Date.parse(f.createdAt ?? "");
        if (!t.match.test(name) || !Number.isFinite(at) || Date.now() - at <= maxAge) continue;
        await videoStorage.remove(f.key).catch(() => undefined);
        removed++;
        bytes += f.size ?? 0;
      }
    }
  }
  if (removed) console.info("[OutputSweep]", JSON.stringify({ removed, mb: Math.round(bytes / 1048576) }));
  return { removed, bytes };
}
