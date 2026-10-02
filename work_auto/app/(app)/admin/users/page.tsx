import { AdminPage } from "@/components/layout/FeaturePage";
import { UserManagement } from "@/features/admin/UserManagement";
import { getFeature } from "@/lib/registry";
import { getSession } from "@/lib/server/auth";

const FEATURE_ID = "admin-users";

export const metadata = { title: getFeature(FEATURE_ID).title };

export default async function Page() {
  const session = await getSession();
  return (
    <AdminPage featureId={FEATURE_ID}>
      <UserManagement currentUserId={session?.user.id ?? ""} />
    </AdminPage>
  );
}
