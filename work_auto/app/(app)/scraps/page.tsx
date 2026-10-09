import { FeaturePage } from "@/components/layout/FeaturePage";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrapBoard } from "@/features/scraps/ScrapBoard";
import { getStandalonePage } from "@/lib/registry";

const page = getStandalonePage("scraps");

export const metadata = { title: page.title };

export default function Page() {
  return (
    <FeaturePage
      featureId={page.id}
      width="wide"
      header={<PageHeader title={page.title} description={page.description} icon={page.icon} accent="tools" status="live" crumbs={[{ label: "홈", href: "/" }, { label: page.title }]} />}
    >
      <ScrapBoard />
    </FeaturePage>
  );
}
