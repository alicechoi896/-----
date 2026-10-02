import { CHANNELS, STANDALONE_PAGES } from "./channels";
import { FEATURES } from "./features";
import type { ChannelDef, FeatureDef, HubId, StandalonePageDef } from "./types";

export { CHANNELS, FEATURES, STANDALONE_PAGES };
export type * from "./types";

export function getChannel(id: HubId): ChannelDef {
  const channel = CHANNELS.find((c) => c.id === id);
  if (!channel) throw new Error(`Unknown channel: ${id}`);
  return channel;
}

export function getHomeChannels(): ChannelDef[] {
  return CHANNELS.filter((c) => c.showOnHome);
}

export function getFeaturesByChannel(id: HubId): FeatureDef[] {
  return FEATURES.filter((f) => f.channelId === id).sort((a, b) => a.order - b.order);
}

export function getFeature(id: string): FeatureDef {
  const feature = FEATURES.find((f) => f.id === id);
  if (!feature) throw new Error(`Unknown feature: ${id}`);
  return feature;
}

export function findFeature(id: string): FeatureDef | undefined {
  return FEATURES.find((f) => f.id === id);
}

export function getStandalonePage(id: string): StandalonePageDef {
  const page = STANDALONE_PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown page: ${id}`);
  return page;
}

/** 브레드크럼 항목 */
export interface Crumb {
  label: string;
  href?: string;
}

/** 기능 페이지의 브레드크럼: 홈 > 채널 > 기능 */
export function getFeatureCrumbs(featureId: string): Crumb[] {
  const feature = getFeature(featureId);
  const channel = getChannel(feature.channelId);
  return [
    { label: "홈", href: "/" },
    { label: channel.name, href: channel.href },
    { label: feature.title },
  ];
}

/** 경로에 해당하는 기능 (사이드바 활성 표시용). 가장 긴 href 가 일치하는 기능 */
export function matchFeatureByPath(pathname: string): FeatureDef | undefined {
  return FEATURES.filter((f) => f.href !== "/settings" && (pathname === f.href || pathname.startsWith(f.href + "/"))).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
