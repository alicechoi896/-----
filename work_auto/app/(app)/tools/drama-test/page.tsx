import { FeaturePage } from "@/components/layout/FeaturePage";
import { DramaTestWorkspace } from "@/features/drama-test/DramaTestWorkspace";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "drama-test";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <DramaTestWorkspace />
    </FeaturePage>
  );
}
