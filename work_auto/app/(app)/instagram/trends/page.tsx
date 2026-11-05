import { FeaturePage } from "@/components/layout/FeaturePage";
import { InstagramTrendTabs } from "@/features/instagram-trends/InstagramTrendTabs";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "ig-trends";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.180 ?tab=read = 릴스 읽기 탭 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <FeaturePage featureId={FEATURE_ID} width={sp.tab === "read" ? "wide" : "default"}>
      <InstagramTrendTabs initialTab={sp.tab === "read" ? "read" : "find"} />
    </FeaturePage>
  );
}
