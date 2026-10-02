import { AdminPage } from "@/components/layout/FeaturePage";
import { ApprovalQueue } from "@/features/admin/ApprovalQueue";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "admin-approvals";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <AdminPage featureId={FEATURE_ID}>
      <ApprovalQueue />
    </AdminPage>
  );
}
