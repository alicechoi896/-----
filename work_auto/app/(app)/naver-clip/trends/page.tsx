import { FeaturePage } from "@/components/layout/FeaturePage";
import { NaverTrendExplorer } from "@/features/naver-trends/NaverTrendExplorer";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "clip-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <NaverTrendExplorer scope="clip" />
    </FeaturePage>
  );
}
