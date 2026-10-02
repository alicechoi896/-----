import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/States";
import { ROLE_LABEL, canAccess, lowestTierFor } from "@/lib/permissions";
import { getChannel, getFeaturesByChannel, type HubId } from "@/lib/registry";
import { getSession } from "@/lib/server/auth";
import { FeatureCard } from "./FeatureCard";

/**
 * 2차 메뉴 화면 (채널 허브). Registry 만으로 화면 전체가 만들어진다.
 * 새 채널 페이지: app/(app)/<채널>/page.tsx 에서 <ChannelHub channelId="..." /> 한 줄이면 된다.
 * 권한이 없는 기능은 잠긴 카드로 보여주고, 필요한 등급을 안내한다.
 */
export async function ChannelHub({ channelId, children }: { channelId: HubId; children?: ReactNode }) {
  const channel = getChannel(channelId);
  const features = getFeaturesByChannel(channelId);
  const session = await getSession();
  const allowed = session?.allowed ?? [];

  const header = (
    <PageHeader
      title={channel.hubTitle}
      description={channel.hubDescription}
      icon={channel.icon}
      accent={channel.accent}
      crumbs={[{ label: "홈", href: "/" }, { label: channel.name }]}
    />
  );

  if (channel.adminOnly && session?.role !== "admin") {
    return (
      <PageContainer>
        {header}
        <SectionCard>
          <EmptyState icon={Lock} title="관리자만 볼 수 있는 화면입니다" action={<LinkButton href="/">홈으로</LinkButton>} className="py-20" />
        </SectionCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((f) => {
          const locked = !canAccess(allowed, f.id);
          const tier = locked ? lowestTierFor(f.id) : null;
          return (
            <FeatureCard
              key={f.id}
              feature={f}
              accent={channel.accent}
              lockedLabel={locked ? (tier ? `${ROLE_LABEL[tier]} 이상` : "권한 없음") : undefined}
            />
          );
        })}
      </div>
      {children && <div className="mt-10">{children}</div>}
    </PageContainer>
  );
}
