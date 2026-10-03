import { AdminPage } from "@/components/layout/FeaturePage";
import { ErrorLogView } from "@/features/admin/ErrorLogView";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "admin-errors";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <AdminPage featureId={FEATURE_ID}>
      <ErrorLogView />
    </AdminPage>
  );
}
