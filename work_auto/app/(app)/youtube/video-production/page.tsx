import { FeaturePage } from "@/components/layout/FeaturePage";
import { VideoProductionWorkspace } from "@/features/video-production/VideoProductionWorkspace";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "yt-video-production";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default async function Page({ searchParams }: PageProps<"/youtube/video-production">) {
  const sp = await searchParams;
  const contentId = typeof sp.contentId === "string" ? sp.contentId.slice(0, 80) : undefined;
  // v0.9.138 제품 영상 자동 제작 결과 편집 (?jobId=&autoDate=&autoItem=)
  const jobId = typeof sp.jobId === "string" ? sp.jobId.slice(0, 80) : undefined;
  const autoLink = typeof sp.autoDate === "string" && typeof sp.autoItem === "string" ? { date: sp.autoDate.slice(0, 10), itemId: sp.autoItem.slice(0, 60) } : undefined;
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <VideoProductionWorkspace channelId="youtube" initialContentId={contentId} initialJobId={jobId} autoLink={autoLink} />
    </FeaturePage>
  );
}
