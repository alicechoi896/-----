import { redirect } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import { connection } from "next/server";
import { getSession } from "@/lib/server/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LinkButton } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { AuthFooter } from "../AuthFooter";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인" };

/** 로그인 / 회원가입 화면 (사이드바 없는 단독 화면) */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  const { next, error, withdrawn } = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured && (await getSession())) redirect(typeof next === "string" ? next : "/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size={52} className="rounded-xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-fg">{SITE_NAME}</h1>
          <p className="mt-1 text-sm text-fg-subtle">{SITE_TAGLINE}</p>
        </div>

        {withdrawn && (
          <Notice tone="info" className="mb-4">
            탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.
          </Notice>
        )}
        {configured ? (
          <LoginForm next={typeof next === "string" ? next : "/"} callbackError={error === "callback"} />
        ) : (
          <div className="rounded-card border border-line bg-canvas p-6 shadow-card">
            <Notice tone="info" title="데모 모드로 실행 중입니다">
              Supabase 가 아직 연결되지 않아 로그인 없이 데모 관리자로 사용합니다. 연결 방법은 docs/SUPABASE_SETUP.md 를 참고하세요.
            </Notice>
            <LinkButton href="/" variant="primary" className="mt-4 w-full">
              데모로 시작하기
            </LinkButton>
          </div>
        )}
        <AuthFooter />
      </div>
    </main>
  );
}
