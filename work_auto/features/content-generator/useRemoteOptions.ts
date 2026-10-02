"use client";

import type { RemoteSource } from "@/lib/generators/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";

export interface RemoteOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * remote-select 필드의 선택지를 서버에서 불러온다.
 * 새 RemoteSource 를 추가하면 여기에 loader 를 하나 추가한다.
 */
const LOADERS: Record<RemoteSource, (param?: string) => Promise<RemoteOption[]>> = {
  products: async () =>
    (await api.products.list()).map((p) => ({ value: p.id, label: `${p.name} · ${p.brand}`, description: p.oneLiner })),
  // 찜한 영상(★)이 먼저, 그다음 기본 검색 조건의 상위 영상
  "youtube-trends": async () =>
    (await api.trends.options("youtube")).map((t) => ({
      value: t.id,
      label: t.group === "찜한 영상" ? `★ ${t.title}` : t.title,
      description: [t.group, t.keywords.join(", ")].filter(Boolean).join(" · "),
    })),
  "naver-trends": async () =>
    (await api.trends.options("naver")).map((t) => ({ value: t.id, label: t.title, description: t.keywords.join(", ") })),
  videos: async () =>
    (await api.videos.list()).map((v) => ({ value: v.id, label: v.title, description: `${v.channelName}${v.note ? ` · ${v.note}` : ""}` })),
  // 이 채널에 쓸 수 있는 스타일(적용 채널에 포함되거나 모든 채널)만. 기본 스타일은 ★
  styles: async (channelId) =>
    (await api.styles.list())
      .filter((s) => !channelId || s.channelIds.length === 0 || s.channelIds.includes(channelId as (typeof s.channelIds)[number]))
      .map((s) => ({
        value: s.id,
        label: `${s.isDefault ? "★ " : ""}${s.name}`,
        description: [s.tone, s.hooks.length ? `Hook ${s.hooks.length}개` : "", s.ctas.length ? `CTA ${s.ctas.length}개` : ""].filter(Boolean).join(" · "),
      })),
};

export function useRemoteOptions(source: RemoteSource, param?: string) {
  return useAsync(() => LOADERS[source](param), [source, param]);
}
