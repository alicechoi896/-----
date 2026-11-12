"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Copy, FileText, Film, Images, Layers, MessageSquareText, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select, Textarea } from "@/components/ui";

/** v0.9.199 콘텐츠 세트 — 하나로 시작해 같은 내용으로 영상 원고·캐러셀·블로그 글·스레드 글 */
interface Core {
  kind: "product" | "info";
  title: string;
  topic: string;
  productId: string | null;
  productName: string | null;
  hook: string;
  cta: string;
  keywords: string[];
  body: string;
}
interface ContentSet {
  id: string;
  core: Core;
  source: { type: string; id: string; label: string };
  items: {
    script?: { contentId: string; featureId: string; headline: string; preview?: string } | null;
    blog?: { contentId: string; featureId: string; headline: string; preview?: string } | null;
    carousel?: { id: string; name: string } | null;
    threads?: { posts: string[]; at: string } | null;
  };
  updatedAt: string;
}
type Target = "script" | "blog" | "carousel" | "threads";

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/sets" : `/api/sets${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}
const copy = (t: string) => void navigator.clipboard?.writeText(t).catch(() => undefined);

export function ContentSets({ initialId }: { initialId?: string }) {
  const [list, setList] = useState<ContentSet[] | null>(null);
  const [cur, setCur] = useState<ContentSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await call<ContentSet[]>();
      setList(l);
      setCur(l.find((x) => x.id === initialId) ?? l[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [initialId]);
  useEffect(() => {
    void (async () => load())();
  }, [load]);

  async function run(label: string, f: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({ tone: "warning", text: e instanceof Error ? e.message : "하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }
  const put = (s: ContentSet) => {
    setCur(s);
    setList((l) => [s, ...(l ?? []).filter((x) => x.id !== s.id)]);
  };
  const make = (t: Target, label: string) => cur && run(t, async () => {
    put(await call<ContentSet>({ action: "make", id: cur.id, target: t }));
    setMsg({ tone: "info", text: `${label}을(를) 만들었습니다.` });
  });

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!list) return <LoadingState label="콘텐츠 세트를 불러오는 중…" />;
  if (!list.length || !cur)
    return (
      <EmptyState
        icon={Layers}
        title="아직 콘텐츠 세트가 없습니다"
        description="영상 원고·블로그 글 결과 화면이나 캐러셀 화면의 [이 내용으로 세트 만들기]를 누르면, 그 내용으로 영상 원고·캐러셀·블로그 글·스레드 글을 이어서 만들 수 있습니다."
      />
    );

  const c = cur.core;
  return (
    <div className="space-y-5" data-sets>
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-80" value={cur.id} onChange={(e) => setCur(list.find((x) => x.id === e.target.value) ?? cur)} options={list.map((x) => ({ value: x.id, label: `${x.core.title || x.core.topic} (${x.source.label}에서)` }))} aria-label="세트 고르기" />
        <Badge tone={c.kind === "product" ? "info" : "neutral"}>{c.kind === "product" ? `제품 · ${c.productName ?? ""}` : "정보성"}</Badge>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={() =>
            window.confirm("이 세트를 지울까요? (만든 원고·글·캐러셀은 각 화면에 그대로 남습니다)") &&
            void run("remove", async () => {
              await call({ action: "remove", id: cur.id });
              const rest = list.filter((x) => x.id !== cur.id);
              setList(rest);
              setCur(rest[0] ?? null);
            })
          }
        >
          세트 지우기
        </Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <SectionCard title="기준 내용" icon={Layers} description={`'${cur.source.label}'에서 가져왔습니다. 나머지를 만들 때 이 내용(같은 주제·같은 사실)으로 만듭니다. 고치면 다음에 만드는 것부터 반영됩니다.`} data-set-core>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input key={`t${cur.updatedAt}`} defaultValue={c.title} onBlur={(e) => e.target.value !== c.title && void run("save", async () => put(await call<ContentSet>({ action: "update", id: cur.id, core: { title: e.target.value } })))} placeholder="제목" aria-label="제목" />
          <Input key={`p${cur.updatedAt}`} defaultValue={c.topic} onBlur={(e) => e.target.value !== c.topic && void run("save", async () => put(await call<ContentSet>({ action: "update", id: cur.id, core: { topic: e.target.value } })))} placeholder="주제" aria-label="주제" />
          <Input key={`h${cur.updatedAt}`} defaultValue={c.hook} onBlur={(e) => e.target.value !== c.hook && void run("save", async () => put(await call<ContentSet>({ action: "update", id: cur.id, core: { hook: e.target.value } })))} placeholder="Hook" aria-label="Hook" />
          <Input key={`c${cur.updatedAt}`} defaultValue={c.cta} onBlur={(e) => e.target.value !== c.cta && void run("save", async () => put(await call<ContentSet>({ action: "update", id: cur.id, core: { cta: e.target.value } })))} placeholder="CTA" aria-label="CTA" />
        </div>
        <Textarea key={`b${cur.updatedAt}`} className="mt-2" rows={5} defaultValue={c.body} onBlur={(e) => e.target.value !== c.body && void run("save", async () => put(await call<ContentSet>({ action: "update", id: cur.id, core: { body: e.target.value } })))} aria-label="핵심 내용" />
        {c.keywords.length > 0 && <p className="mt-1 text-[12px] text-fg-subtle">키워드: {c.keywords.join(", ")}</p>}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2" data-set-items>
        <Tile
          icon={Film}
          title="영상 원고 → 영상"
          made={Boolean(cur.items.script)}
          busy={busy === "script"}
          onMake={() => make("script", "영상 원고")}
          makeLabel={cur.items.script ? "원고 다시 만들기" : "영상 원고 만들기"}
          links={cur.items.script ? [{ href: `/${cur.items.script.featureId.startsWith("clip-") ? "naver-clip" : "youtube"}/video-production?contentId=${cur.items.script.contentId}`, label: "이 원고로 영상 만들기" }] : []}
          data="script"
        >
          {cur.items.script && (
            <div className="space-y-1 text-[12.5px]">
              <p className="font-medium">{cur.items.script.headline}</p>
              {cur.items.script.preview && <p className="line-clamp-6 whitespace-pre-line text-fg-muted">{cur.items.script.preview}</p>}
            </div>
          )}
        </Tile>
        <Tile
          icon={Images}
          title="캐러셀"
          made={Boolean(cur.items.carousel)}
          busy={busy === "carousel"}
          onMake={() => make("carousel", "캐러셀 글")}
          makeLabel={cur.items.carousel ? "캐러셀 글 다시 쓰기" : "캐러셀 글 만들기"}
          links={cur.items.carousel ? [{ href: `/instagram/carousel?project=${cur.items.carousel.id}`, label: "캐러셀 열기 (그림·완성)" }] : []}
          hint="장마다 글을 씁니다. 그림(AI, 유료)·완성 이미지는 캐러셀 화면에서 확인 후 만듭니다."
          data="carousel"
        >
          {cur.items.carousel && <p className="text-[12.5px] font-medium">{cur.items.carousel.name}</p>}
        </Tile>
        <Tile
          icon={FileText}
          title="블로그 글"
          made={Boolean(cur.items.blog)}
          busy={busy === "blog"}
          onMake={() => make("blog", "블로그 글")}
          makeLabel={cur.items.blog ? "블로그 글 다시 만들기" : "블로그 글 만들기"}
          links={cur.items.blog ? [{ href: cur.items.blog.featureId === "blog-product-writing" ? "/naver-blog/product-writing" : cur.items.blog.featureId === "blog-info-writing" ? "/naver-blog/info-writing" : "/naver-blog/auto-writing", label: "블로그 화면에서 보기" }] : []}
          data="blog"
        >
          {cur.items.blog && (
            <div className="space-y-1 text-[12.5px]">
              <p className="font-medium">{cur.items.blog.headline}</p>
              {cur.items.blog.preview && (
                <>
                  <p className="line-clamp-6 whitespace-pre-line text-fg-muted">{cur.items.blog.preview}</p>
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(cur.items.blog!.preview!)}>
                    제목·본문 복사
                  </Button>
                </>
              )}
            </div>
          )}
        </Tile>
        <Tile icon={MessageSquareText} title="스레드 글" made={Boolean(cur.items.threads?.posts.length)} busy={busy === "threads"} onMake={() => make("threads", "스레드 글")} makeLabel={cur.items.threads ? "스레드 글 다시 쓰기" : "스레드 글 만들기"} links={[]} data="threads">
          {cur.items.threads && (
            <div className="space-y-1.5 text-[12.5px]">
              {cur.items.threads.posts.map((p, i) => (
                <div key={i} className="flex items-start gap-1.5 rounded-control border border-line p-2">
                  <span className="shrink-0 text-[11px] font-semibold text-fg-subtle">{i + 1}</span>
                  <p className="min-w-0 flex-1 whitespace-pre-line">{p}</p>
                  <button type="button" onClick={() => copy(p)} className="text-fg-subtle hover:text-brand" aria-label={`${i + 1}번 복사`}>
                    <Copy className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(cur.items.threads!.posts.join("\n\n"))}>
                전체 복사
              </Button>
            </div>
          )}
        </Tile>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, title, made, busy, onMake, makeLabel, links, hint, children, data }: { icon: typeof Film; title: string; made: boolean; busy: boolean; onMake: () => void; makeLabel: string; links: { href: string; label: string }[]; hint?: string; children?: React.ReactNode; data: string }) {
  return (
    <div className="space-y-2 rounded-card border border-line bg-surface p-4" data-set-tile={data}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-fg-subtle" />
        <p className="text-[14px] font-semibold">{title}</p>
        <Badge tone={made ? "success" : "neutral"}>{made ? "있음" : "아직"}</Badge>
      </div>
      {children}
      {hint && <p className="text-[11.5px] text-fg-subtle">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={made ? "secondary" : "primary"} icon={Sparkles} loading={busy} disabled={busy} onClick={onMake} data-set-make={data}>
          {makeLabel}
        </Button>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-[12.5px] font-medium text-brand hover:underline">
            {l.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}

/** 결과 화면에서 [이 내용으로 세트 만들기] — 세트를 만들고(이미 있으면 그 세트) 세트 화면으로 */
export function MakeSetButton({ contentId, carouselId }: { contentId?: string; carouselId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        icon={Layers}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const s = await call<ContentSet>(contentId ? { action: "from-content", contentId } : { action: "from-carousel", carouselId });
            router.push(`/make/sets?id=${encodeURIComponent(s.id)}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "만들지 못했습니다.");
            setBusy(false);
          }
        }}
        data-make-set
      >
        이 내용으로 세트 만들기
      </Button>
      {err && <span className="text-[11.5px] text-danger">{err}</span>}
    </span>
  );
}
