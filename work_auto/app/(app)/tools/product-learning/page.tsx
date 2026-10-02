import { FeaturePage } from "@/components/layout/FeaturePage";
import { ProductLearningWorkspace } from "@/features/product-learning/ProductLearningWorkspace";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-learning";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <ProductLearningWorkspace />
    </FeaturePage>
  );
}
