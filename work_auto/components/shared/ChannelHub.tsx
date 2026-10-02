import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getChannel, getFeaturesByChannel, type HubId } from "@/lib/registry";
import { FeatureCard } from "./FeatureCard";

/**
 * 2차 메뉴 화면 (채널 허브). Registry 만으로 화면 전체가 만들어진다.
 * 새 채널 페이지: app/<채널>/page.tsx 에서 <ChannelHub channelId="..." /> 한 줄이면 된다.
 */
export function ChannelHub({ channelId, children }: { channelId: HubId; children?: ReactNode }) {
  const channel = getChannel(channelId);
  const features = getFeaturesByChannel(channelId);

  return (
    <PageContainer>
      <PageHeader
        title={channel.hubTitle}
        description={channel.hubDescription}
        icon={channel.icon}
        accent={channel.accent}
        crumbs={[{ label: "홈", href: "/" }, { label: channel.name }]}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((f) => (
          <FeatureCard key={f.id} feature={f} accent={channel.accent} />
        ))}
      </div>
      {children && <div className="mt-10">{children}</div>}
    </PageContainer>
  );
}
