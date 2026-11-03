import { FeaturePage } from "@/components/layout/FeaturePage";
import { StayStudio } from "@/features/ai-stay/StayStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "ai-stay";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.157: AI 숙소 영상 (사진 → AI 움직임 → 제목·자막·내레이션 → 9:16 mp4) */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <StayStudio />
    </FeaturePage>
  );
}
