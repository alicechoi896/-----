import { FeaturePage } from "@/components/layout/FeaturePage";
import { SilenceCutTool } from "@/features/silence-cut/SilenceCutTool";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "silence-cut";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <SilenceCutTool />
    </FeaturePage>
  );
}
