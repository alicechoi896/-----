import { FeaturePage } from "@/components/layout/FeaturePage";
import { VideoProductionWorkspace } from "@/features/video-production/VideoProductionWorkspace";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "yt-video-production";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default async function Page({ searchParams }: PageProps<"/youtube/video-production">) {
  const sp = await searchParams;
  const contentId = typeof sp.contentId === "string" ? sp.contentId.slice(0, 80) : undefined;
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <VideoProductionWorkspace channelId="youtube" initialContentId={contentId} />
    </FeaturePage>
  );
}
