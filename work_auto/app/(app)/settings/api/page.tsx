import { FeaturePage } from "@/components/layout/FeaturePage";
import { ApiCenter } from "@/features/api-center/ApiCenter";
import { YouTubeConnectCard } from "@/features/youtube-upload/YouTubeUpload";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "api-center";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <div className="space-y-6">
        <YouTubeConnectCard />
        <ApiCenter />
      </div>
    </FeaturePage>
  );
}
