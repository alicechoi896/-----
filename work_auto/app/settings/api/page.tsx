import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { ApiCenter } from "@/features/api-center/ApiCenter";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "api-center";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={FEATURE_ID} />
      <ApiCenter />
    </PageContainer>
  );
}
