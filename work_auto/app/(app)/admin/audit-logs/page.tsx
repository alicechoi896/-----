import { AdminPage } from "@/components/layout/FeaturePage";
import { AuditLogView } from "@/features/admin/AuditLogView";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "admin-audit-logs";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <AdminPage featureId={FEATURE_ID}>
      <AuditLogView />
    </AdminPage>
  );
}
