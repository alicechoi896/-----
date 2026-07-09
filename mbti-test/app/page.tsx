import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-10 px-8 py-16 text-center">
      <div className="flex animate-[appear_320ms_ease-out] flex-col items-center gap-4">
        <span className="bg-accent-soft text-ink rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide">
          나의 MBTI 찾기
        </span>
        <h1 className="text-3xl leading-tight font-bold text-balance text-foreground">
          12개 질문으로 알아보는
          <br />
          나의 진짜 성격 유형
        </h1>
        <p className="text-base leading-relaxed text-balance text-foreground/60">
          1~2분이면 충분해요. 지금 바로 나의 MBTI를 확인하고 결과를 친구와 비교해보세요.
        </p>
      </div>

      <Link
        href="/test"
        className="bg-accent text-ink flex min-h-[56px] w-full items-center justify-center rounded-full text-lg font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        테스트 시작하기
      </Link>
    </main>
  );
}
