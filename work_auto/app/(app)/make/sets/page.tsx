import { FeaturePage } from "@/components/layout/FeaturePage";
import { ContentSets } from "@/features/content-set/ContentSets";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "content-set";

export const metadata = { title: getFeature(FEATURE_ID).title };

/** v0.9.199 콘텐츠 세트 (?id= 로 그 세트 열기) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id.slice(0, 80) : undefined;
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <ContentSets initialId={id} />
    </FeaturePage>
  );
}
