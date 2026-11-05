import { FeaturePage } from "@/components/layout/FeaturePage";
import { MulticamStudio } from "@/features/multicam/MulticamStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "ai-makeup";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.176: AI 메이크업 (카메라 1대 영상 → 같은 연기의 멀티앵글) */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <MulticamStudio />
    </FeaturePage>
  );
}
