import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { VideoImport } from "@/features/video-import/VideoImport";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "video-import";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer>
      <FeaturePageHeader featureId={FEATURE_ID} />
      <VideoImport />
    </PageContainer>
  );
}
