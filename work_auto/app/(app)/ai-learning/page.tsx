import { FeaturePage } from "@/components/layout/FeaturePage";
import { PageHeader } from "@/components/layout/PageHeader";
import { AiLearningCenter } from "@/features/ai-learning/AiLearningCenter";
import { getStandalonePage } from "@/lib/registry";

const page = getStandalonePage("ai-learning");

export const metadata = { title: page.title };

/** ?tab=styles&styleRef=… : 다른 화면(트렌드 영상 등)에서 "스타일로 저장"을 누르고 넘어온 경우 */
export default async function Page({ searchParams }: PageProps<"/ai-learning">) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  const styleRef = typeof sp.styleRef === "string" ? sp.styleRef.slice(0, 4000) : undefined;
  const styleChannel = typeof sp.styleChannel === "string" ? sp.styleChannel : undefined;
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
          status="mock"
          crumbs={[{ label: "홈", href: "/" }, { label: page.title }]}
        />
      }
    >
      <AiLearningCenter initialTab={tab} styleRef={styleRef} styleChannel={styleChannel} />
    </FeaturePage>
  );
}
