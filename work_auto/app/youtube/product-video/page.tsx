import { FeaturePageHeader } from "@/components/layout/FeaturePageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { ContentGenerator } from "@/features/content-generator/ContentGenerator";
import { getFeature } from "@/lib/registry";
import { pickStringParams } from "@/lib/search-params";

const FEATURE_ID = "yt-product-video";

export const metadata = { title: getFeature(FEATURE_ID).title };

/**
 * 3차 화면: 생성형 기능. 입력/출력은 lib/generators/configs.ts 의 "yt-product-video" 설정을 따른다.
 * ?productId=, ?trendId= 등 폼 필드 이름과 같은 쿼리는 초기값이 된다.
 */
export default async function Page({ searchParams }: PageProps<"/youtube/product-video">) {
  const initialValues = pickStringParams(await searchParams);
  return (
    <PageContainer width="wide">
      <FeaturePageHeader featureId={FEATURE_ID} />
      <ContentGenerator featureId={FEATURE_ID} initialValues={initialValues} />
    </PageContainer>
  );
}
