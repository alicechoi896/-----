import { FeaturePage } from "@/components/layout/FeaturePage";
import { ApiCenter } from "@/features/api-center/ApiCenter";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "api-center";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <ApiCenter />
    </FeaturePage>
  );
}
