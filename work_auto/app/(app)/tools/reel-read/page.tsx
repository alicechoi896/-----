import { FeaturePage } from "@/components/layout/FeaturePage";
import { ReelRead } from "@/features/reel-read/ReelRead";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "reel-read";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.175: 릴스 읽기 (받아쓰기 + 장면별 화면 + 구조 + 아이디어) */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <ReelRead />
    </FeaturePage>
  );
}
