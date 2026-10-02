import { AdminPage } from "@/components/layout/FeaturePage";
import { PermissionMatrix } from "@/features/admin/PermissionMatrix";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "admin-permissions";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <AdminPage featureId={FEATURE_ID}>
      <PermissionMatrix />
    </AdminPage>
  );
}
