import { FeaturePage } from "@/components/layout/FeaturePage";
import { InstagramTrendExplorer } from "@/features/instagram-trends/InstagramTrendExplorer";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "ig-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <InstagramTrendExplorer />
    </FeaturePage>
  );
}
