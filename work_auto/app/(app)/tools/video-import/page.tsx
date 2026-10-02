import { FeaturePage } from "@/components/layout/FeaturePage";
import { VideoImport } from "@/features/video-import/VideoImport";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "video-import";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <VideoImport />
    </FeaturePage>
  );
}
