import { FeaturePage } from "@/components/layout/FeaturePage";
import { FashionStudio } from "@/features/fashion/FashionStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "ig-fashion";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.103: AI 패션 피드·릴스 (상품 → 모델 → 배경·문구 → 룩 이미지 → 피드·릴스) */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <FashionStudio />
    </FeaturePage>
  );
}
