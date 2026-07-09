import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMbtiTypeInfo, mbtiTypes } from "@/data/mbtiTypes";
import { groupThemeClasses } from "@/lib/groupTheme";

interface ResultPageProps {
  params: Promise<{ type: string }>;
}

export function generateStaticParams() {
  return Object.keys(mbtiTypes).map((type) => ({ type }));
}

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { type } = await params;
  const info = getMbtiTypeInfo(type.toUpperCase());
  if (!info) return {};

  return {
    title: `${info.type} · ${info.nickname} - 나의 MBTI 찾기`,
    description: info.summary,
  };
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { type } = await params;
  const info = getMbtiTypeInfo(type.toUpperCase());
  if (!info) notFound();

  const theme = groupThemeClasses[info.group];

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-5 pb-16">
      <section className={`mt-6 flex flex-col items-center gap-2 rounded-3xl ${theme.bgSoft} px-6 py-10 text-center`}>
        <p className={`text-sm font-semibold ${theme.text}`}>{info.group} 그룹</p>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">{info.type}</h1>
        <p className="text-lg font-medium text-zinc-800">{info.nickname}</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{info.summary}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-foreground">강점</h2>
        <ul className="flex flex-col gap-2">
          {info.strengths.map((item) => (
            <li
              key={item}
              className="bg-foreground/3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-foreground/80"
            >
              <span className={`mt-0.5 ${theme.text}`} aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">약점</h2>
        <ul className="flex flex-col gap-2">
          {info.weaknesses.map((item) => (
            <li
              key={item}
              className="bg-foreground/3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-foreground/80"
            >
              <span className="mt-0.5 text-foreground/40" aria-hidden>
                !
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">추천 직업</h2>
        <div className="flex flex-wrap gap-2">
          {info.recommendedJobs.map((job) => (
            <span
              key={job}
              className={`rounded-full px-4 py-2 text-sm font-medium ${theme.bgSoft} ${theme.text}`}
            >
              {job}
            </span>
          ))}
        </div>
      </section>

      <Link
        href="/test"
        className="bg-accent mt-10 flex min-h-[52px] items-center justify-center rounded-2xl text-base font-semibold text-white transition-opacity hover:opacity-90"
      >
        테스트 다시하기
      </Link>
    </main>
  );
}
