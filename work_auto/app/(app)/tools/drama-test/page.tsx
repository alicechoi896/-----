import { FeaturePage } from "@/components/layout/FeaturePage";
import { DramaStudio } from "@/features/drama-studio/DramaStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "drama-test";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.81: AI 드라마 스튜디오 (8단계 제작). 기존 'AI 드라마 시험'은 [모델 비교 시험] 탭에 그대로 */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <DramaStudio />
    </FeaturePage>
  );
}
