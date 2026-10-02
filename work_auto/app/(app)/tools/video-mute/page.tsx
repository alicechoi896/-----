import { FeaturePage } from "@/components/layout/FeaturePage";
import { VideoMuteTool } from "@/features/video-mute/VideoMuteTool";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "video-mute";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <VideoMuteTool />
    </FeaturePage>
  );
}
