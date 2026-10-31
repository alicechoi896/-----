import { FeaturePage } from "@/components/layout/FeaturePage";
import { AutoVideo } from "@/features/auto-video/AutoVideo";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "yt-auto-video";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.107: 제품 홍보 영상 자동 제작 — 설정 + 아침 보고 */
export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID}>
      <AutoVideo />
    </FeaturePage>
  );
}
