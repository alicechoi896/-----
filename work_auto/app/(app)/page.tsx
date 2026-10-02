import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChannelCard } from "@/components/shared/ChannelCard";
import { HomeOverview } from "@/features/home/HomeOverview";
import { getFeaturesByChannel, getHomeChannels } from "@/lib/registry";

/** 1차 화면: 채널 선택. 세부 기능은 보여주지 않는다 */
export default function HomePage() {
  const channels = getHomeChannels();
  return (
    <PageContainer>
      <PageHeader title="콘텐츠 자동화 센터" description="작업할 채널을 선택하세요." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {channels.map((c) => (
          <ChannelCard key={c.id} channel={c} featureCount={getFeaturesByChannel(c.id).length} />
        ))}
      </div>
      <HomeOverview />
    </PageContainer>
  );
}
