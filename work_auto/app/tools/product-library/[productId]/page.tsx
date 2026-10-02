import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductDetailView } from "@/features/product-library/ProductDetailView";
import { getFeatureCrumbs } from "@/lib/registry";

export const metadata = { title: "제품 상세" };

/** 제품 상세 (/tools/product-library/:productId, ?mode=edit 이면 수정 폼이 열린 상태) */
export default async function Page({ params, searchParams }: PageProps<"/tools/product-library/[productId]">) {
  const { productId } = await params;
  const { mode } = await searchParams;
  const crumbs = getFeatureCrumbs("product-library");
  crumbs[crumbs.length - 1] = { label: "제품 라이브러리", href: "/tools/product-library" };

  return (
    <PageContainer width="wide">
      <PageHeader title="제품 상세" crumbs={[...crumbs, { label: "제품 상세" }]} />
      <ProductDetailView productId={productId} initialMode={mode === "edit" ? "edit" : "view"} />
    </PageContainer>
  );
}
