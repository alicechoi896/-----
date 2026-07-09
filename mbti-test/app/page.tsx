import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col gap-3">
        <p className="text-accent text-sm font-semibold">나의 MBTI 찾기</p>
        <h1 className="text-3xl leading-tight font-bold text-foreground">
          12개 질문으로 알아보는
          <br />
          나의 진짜 성격 유형
        </h1>
        <p className="text-base leading-relaxed text-foreground/60">
          1~2분이면 충분해요. 지금 바로 나의 MBTI를 확인하고 결과를 친구와 비교해보세요.
        </p>
      </div>

      <Link
        href="/test"
        className="bg-accent flex min-h-[56px] w-full items-center justify-center rounded-2xl text-lg font-semibold text-white transition-opacity hover:opacity-90"
      >
        테스트 시작하기
      </Link>
    </main>
  );
}
