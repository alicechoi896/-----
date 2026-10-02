import { AuthShell } from "../AuthShell";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "비밀번호 찾기" };

export default function Page() {
  return (
    <AuthShell title="비밀번호 찾기" description="가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내드립니다.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
