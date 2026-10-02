import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { NaverTrendExplorer } from "@/features/naver-trends/NaverTrendExplorer";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "clip-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={FEATURE_ID} />
      <NaverTrendExplorer scope="clip" />
    </PageContainer>
  );
}
