import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { YouTubeTrendExplorer } from "@/features/youtube-trends/YouTubeTrendExplorer";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "yt-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={FEATURE_ID} />
      <YouTubeTrendExplorer />
    </PageContainer>
  );
}
