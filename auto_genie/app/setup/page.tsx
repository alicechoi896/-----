import { isAiConfigured, isSupabaseConfigured } from "@/lib/env";
import { CheckCircle2, XCircle } from "lucide-react";

// Reflects the actual running server's env at request time, not a build-time
// snapshot — never eligible for static prerendering.
export const dynamic = "force-dynamic";

export default function SetupPage() {
  const items = [
    {
      label: "Supabase 연결",
      ok: isSupabaseConfigured(),
      vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      help: "Supabase 프로젝트를 생성한 뒤 API 설정에서 URL과 키를 복사해 .env.local에 입력하세요.",
    },
    {
      label: "OpenAI API",
      ok: isAiConfigured(),
      vars: ["OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_EMBEDDING_MODEL"],
      help: "OpenAI API 키를 발급받아 .env.local에 입력하세요. 모델명은 비워두면 기본값이 사용됩니다.",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <div className="mb-6">
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
            jini-ai-marketing-brain · 초기 설정
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900">
            서비스를 시작하려면 환경변수 설정이 필요합니다
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            아래 항목이 모두 완료되면 자동으로 로그인 화면으로 이동합니다. 실제 AI 분석 결과를 가짜로
            생성하지 않기 때문에, 설정 전에는 기능을 사용할 수 없습니다.
          </p>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-neutral-200 p-4 flex gap-3 items-start"
            >
              {item.ok ? (
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-5 text-orange-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-neutral-900">{item.label}</p>
                  <span
                    className={
                      item.ok
                        ? "text-xs font-medium text-emerald-600"
                        : "text-xs font-medium text-orange-500"
                    }
                  >
                    {item.ok ? "설정 완료" : "설정 필요"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">{item.help}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.vars.map((v) => (
                    <code
                      key={v}
                      className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-sm text-neutral-500">
          <p>
            프로젝트 루트의 <code className="font-mono">.env.example</code>을{" "}
            <code className="font-mono">.env.local</code>로 복사한 뒤 값을 채우고 개발 서버를
            재시작하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
