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
const LOADERS: Record<RemoteSource, () => Promise<RemoteOption[]>> = {
  products: async () =>
    (await api.products.list()).map((p) => ({ value: p.id, label: `${p.name} · ${p.brand}`, description: p.oneLiner })),
  "youtube-trends": async () =>
    (await api.trends.options("youtube")).map((t) => ({ value: t.id, label: t.title, description: t.keywords.join(", ") })),
  "naver-trends": async () =>
    (await api.trends.options("naver")).map((t) => ({ value: t.id, label: t.title, description: t.keywords.join(", ") })),
  videos: async () =>
    (await api.videos.list()).map((v) => ({ value: v.id, label: v.title, description: `${v.channelName}${v.note ? ` · ${v.note}` : ""}` })),
  styles: async () =>
    (await api.styles.list()).map((s) => ({ value: s.id, label: s.name, description: s.tone })),
};

export function useRemoteOptions(source: RemoteSource) {
  return useAsync(() => LOADERS[source](), [source]);
}
