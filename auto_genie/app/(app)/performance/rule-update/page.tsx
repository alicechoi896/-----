import { requireUser } from "@/lib/auth";
import { RuleUpdateClient } from "./rule-update-client";

export default async function RuleUpdatePage() {
  const user = await requireUser();
  return <RuleUpdateClient approverEmail={user.email ?? "워크스페이스 소유자"} />;
}
