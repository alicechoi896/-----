import { AdminPage } from "@/components/layout/FeaturePage";
import { CostDashboard } from "@/features/admin/CostDashboard";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "admin-costs";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <AdminPage featureId={FEATURE_ID}>
      <CostDashboard />
    </AdminPage>
  );
}
