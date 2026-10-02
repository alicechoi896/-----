import type { ReactNode } from "react";
import { getChannel, getFeature, getFeatureCrumbs } from "@/lib/registry";
import { PageHeader } from "./PageHeader";

/** 기능(3차) 페이지 헤더: Registry 의 제목, 설명, 아이콘, 상태, 브레드크럼을 그대로 쓴다 */
export function FeaturePageHeader({ featureId, actions }: { featureId: string; actions?: ReactNode }) {
  const feature = getFeature(featureId);
  const channel = getChannel(feature.channelId);
  return (
    <PageHeader
      title={feature.title}
      description={feature.description}
      crumbs={getFeatureCrumbs(featureId)}
      icon={feature.icon}
      accent={channel.accent}
      status={feature.status}
      actions={actions}
    />
  );
}
