import { FeaturePage } from "@/components/layout/FeaturePage";
import { CarouselStudio } from "@/features/carousel/CarouselStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-carousel";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.163: 제품 캐러셀 (사진 → AI 글 → 4:5 PNG·설명글·해시태그) */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <CarouselStudio />
    </FeaturePage>
  );
}
