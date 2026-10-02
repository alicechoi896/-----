import { FeaturePage } from "@/components/layout/FeaturePage";
import { PageHeader } from "@/components/layout/PageHeader";
import { UploadCalendar } from "@/features/uploads/UploadCalendar";
import { getStandalonePage } from "@/lib/registry";

const page = getStandalonePage("uploads");

export const metadata = { title: page.title };

/** ?contentId=… : 생성 결과 화면의 [업로드 등록]에서 넘어오면 그 콘텐츠를 고른 등록 창을 연다 */
export default async function Page({ searchParams }: PageProps<"/uploads">) {
  const sp = await searchParams;
  const contentId = typeof sp.contentId === "string" ? sp.contentId.slice(0, 80) : undefined;
  return (
    <FeaturePage
      featureId={page.id}
      width="wide"
      header={
        <PageHeader
          title={page.title}
          description={page.description}
          icon={page.icon}
          accent="tools"
          status="live"
          crumbs={[{ label: "홈", href: "/" }, { label: page.title }]}
        />
      }
    >
      <UploadCalendar presetContentId={contentId} />
    </FeaturePage>
  );
}
