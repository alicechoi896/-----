import { FeaturePage } from "@/components/layout/FeaturePage";
import { PageHeader } from "@/components/layout/PageHeader";
import { ManualView } from "@/features/manual/ManualView";
import { getStandalonePage } from "@/lib/registry";
import { getSession } from "@/lib/server/auth";

const page = getStandalonePage("manual");

export const metadata = { title: page.title };

export default async function Page() {
  const session = await getSession();
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
      <ManualView isAdmin={session?.role === "admin"} />
    </FeaturePage>
  );
}
