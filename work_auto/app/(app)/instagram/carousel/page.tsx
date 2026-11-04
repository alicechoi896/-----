import { FeaturePage } from "@/components/layout/FeaturePage";
import { CarouselStudio } from "@/features/carousel/CarouselStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "product-carousel";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.173: 인스타그램 캐러셀 (주제·내용 → AI 글 → 테마·참고 디자인 → 그림 → 4:5 PNG·캡션) — v0.9.163 제품 캐러셀을 넓힘 */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <CarouselStudio />
    </FeaturePage>
  );
}
