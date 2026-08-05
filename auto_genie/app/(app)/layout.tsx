import { requireCurrentOrganization, getUserOrganizations, requireUser } from "@/lib/auth";
import { resolveScreenMode, canUseTechnicalMode } from "@/lib/access/screen-mode";
import { AppShell } from "@/components/app-shell";

// Every page here shows the signed-in user's live organization data — never
// eligible for static prerendering.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const organization = await requireCurrentOrganization();
  const organizations = await getUserOrganizations();
  const screenMode = await resolveScreenMode(organization.role);

  return (
    <AppShell
      organization={organization}
      organizations={organizations}
      userEmail={user.email ?? ""}
      screenMode={screenMode}
      canUseTechnicalMode={canUseTechnicalMode(organization.role)}
    >
      {children}
    </AppShell>
  );
}
