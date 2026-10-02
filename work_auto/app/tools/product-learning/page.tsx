import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProductLearningWorkspace } from "@/features/product-learning/ProductLearningWorkspace";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-learning";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer>
      <FeaturePageHeader featureId={FEATURE_ID} />
      <ProductLearningWorkspace />
    </PageContainer>
  );
}
