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
  videos: async () => {
    const [videos, products] = await Promise.all([api.videos.list(), api.products.list().catch(() => [])]);
    const productName = new Map(products.map((p) => [p.id, p.name]));
    return videos.map((v) => ({
      value: v.id,
      label: v.title,
      description: [v.productId ? `제품: ${productName.get(v.productId) ?? "-"}` : "", v.channelName, v.note ?? ""].filter(Boolean).join(" · "),
    }));
  },
  // 사용 중인 콘텐츠 프로필 (기본 = ★)
  profiles: async () =>
    (await api.profiles.list())
      .filter((p) => p.isActive)
      .map((p) => ({
        value: p.id,
        label: `${p.isDefault ? "★ " : ""}${p.name}`,
        description: [p.mainCategory, ...p.subCategories].join(" · "),
      })),
  // 이 유형(제품 홍보·정보성)·채널에 쓸 수 있는 대본 포맷. 기본 포맷은 ★ (param = "product:youtube")
  "script-formats": async (param) => {
    const [type, channelId] = (param ?? "").split(":");
    return (await api.scriptFormats.list())
      .filter((f) => f.contentType === type && (f.channelIds.length === 0 || f.channelIds.includes(channelId as (typeof f.channelIds)[number])))
      .map((f) => ({
        value: f.id,
        label: `${f.isDefault ? "★ " : ""}${f.name}`,
        description: [f.examples.length ? `참고 대본 ${f.examples.length}개` : "", f.guideline.split("\n").find((l) => /^\s*1\)/.test(l))?.trim() ?? ""].filter(Boolean).join(" · "),
      }));
  },
  // 이 채널에 쓸 수 있는 스타일(적용 채널에 포함되거나 모든 채널)만. 기본 스타일은 ★
  styles: async (channelId) =>
    (await api.styles.list())
      .filter((s) => !channelId || s.channelIds.length === 0 || s.channelIds.includes(channelId as (typeof s.channelIds)[number]))
      .map((s) => ({
        value: s.id,
        label: `${s.isDefault ? "★ " : ""}${s.name}`,
        description: [s.isDefault ? "기본 스타일" : "", s.tone].filter(Boolean).join(" · "),
      })),
};

export function useRemoteOptions(source: RemoteSource, param?: string) {
  return useAsync(() => LOADERS[source](param), [source, param]);
}
