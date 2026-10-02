import { FeaturePage } from "@/components/layout/FeaturePage";
import { YouTubeTrendExplorer } from "@/features/youtube-trends/YouTubeTrendExplorer";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "yt-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <YouTubeTrendExplorer />
    </FeaturePage>
  );
}
