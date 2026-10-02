import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProductLibrary } from "@/features/product-library/ProductLibrary";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-library";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={FEATURE_ID} />
      <ProductLibrary />
    </PageContainer>
  );
}
