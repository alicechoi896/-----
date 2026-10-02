import { FeaturePage } from "@/components/layout/FeaturePage";
import { ProductLibrary } from "@/features/product-library/ProductLibrary";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-library";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <ProductLibrary />
    </FeaturePage>
  );
}
