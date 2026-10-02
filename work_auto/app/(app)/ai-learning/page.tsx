import { FeaturePage } from "@/components/layout/FeaturePage";
import { PageHeader } from "@/components/layout/PageHeader";
import { AiLearningCenter } from "@/features/ai-learning/AiLearningCenter";
import { getStandalonePage } from "@/lib/registry";

const page = getStandalonePage("ai-learning");

export const metadata = { title: page.title };

export default function Page() {
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
      <AiLearningCenter />
    </FeaturePage>
  );
}
