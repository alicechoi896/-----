import { FeaturePage } from "@/components/layout/FeaturePage";
import { DetailPageStudio } from "@/features/detail-page/DetailPageStudio";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "detail-page";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.167: 상세페이지 만들기 (?productId= 로 바로 시작) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const productId = typeof sp.productId === "string" ? sp.productId.slice(0, 80) : undefined;
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <DetailPageStudio initialProductId={productId} />
    </FeaturePage>
  );
}
