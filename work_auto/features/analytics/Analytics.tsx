"use client";

import { useEffect, useState } from "react";
import { BarChart3, FlaskConical, RefreshCw, Sparkles, Swords } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, StatTile, Tabs, Textarea } from "@/components/ui";
import { WEEKLY_PLAN, type AnalyticsVideo, type FeatureRow } from "@/lib/domain/analytics";

/**
 * 성과 분석 (v0.9.151) — 유튜브 먼저. 인스타그램은 준비 중, 네이버 클립·블로그는 나중에.
 * 숫자는 업로드 관리에 유튜브 주소가 있는 영상으로 계산 (YouTube 무료 할당량). AI 는 버튼을 누를 때만 1번.
 */
type Platform = "youtube" | "instagram" | "naver-clip" | "naver-blog";
type Tab = "overview" | "patterns" | "compare" | "hooks";
interface MyVideos {
  videos: AnalyticsVideo[];
  counted: number;
  overallMedian: number;
  rows: FeatureRow[];
  standouts: FeatureRow[];
  missingUrl: number;
  at: string;
}
interface CompareVideo {
  title: string;
  url: string;
  views: number | null;
  durationSec: number;
  publishedAt: string;
  thumbnailUrl: string | null;
}

async function call<T>(body?: Record<string, unknown>, refresh = false): Promise<T> {
  const res = await fetch(`/api/analytics/youtube${refresh ? "?refresh=1" : ""}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "불러오지 못했습니다.");
  return j.data;
}

const num = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ko-KR"));
const ratioTone = (r: FeatureRow) => (r.few ? "neutral" : r.ratio >= 1.3 ? "success" : r.ratio <= 0.7 ? "danger" : "neutral");

export function Analytics() {
  const [platform, setPlatform] = useState<Platform>("youtube");
  return (
    <div className="space-y-5" data-analytics>
      <SegmentedControl<Platform>
        value={platform}
        onChange={setPlatform}
        options={[
          { value: "youtube", label: "유튜브" },
          { value: "instagram", label: "인스타그램 (준비 중)" },
          { value: "naver-clip", label: "네이버 클립 (나중에)" },
          { value: "naver-blog", label: "네이버 블로그 (나중에)" },
        ]}
      />
      {platform === "youtube" ? (
        <YouTubeAnalytics />
      ) : platform === "instagram" ? (
        <Notice tone="info">
          인스타그램은 내 계정 성과를 읽으려면 프로페셔널(비즈니스·크리에이터) 계정과 공식 &lsquo;인스타그램 로그인&rsquo; 연결 권한이 필요해서 준비 중입니다. 로그인해서 화면을 긁어 오는 방식은 계정 정지 위험이 있어 쓰지 않습니다. 그동안은 업로드 관리에 조회수를 직접 넣어 주세요.
        </Notice>
      ) : (
        <Notice tone="neutral">네이버 클립·블로그 성과 분석은 나중에 추가합니다. 지금은 업로드 관리에 숫자를 직접 넣어 기록할 수 있습니다.</Notice>
      )}
    </div>
  );
}

function YouTubeAnalytics() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<MyVideos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      setData(await call<MyVideos>(undefined, refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => load())();
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="내 유튜브 영상 숫자를 모으는 중…" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "개요", icon: BarChart3 },
            { value: "patterns", label: "패턴 찾기", icon: Sparkles },
            { value: "compare", label: "경쟁 비교", icon: Swords },
            { value: "hooks", label: "훅 연구소", icon: FlaskConical },
          ]}
        />
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={loading} onClick={() => void load(true)} data-analytics-refresh>
          새로 불러오기
        </Button>
      </div>
      {data.missingUrl > 0 && <Notice tone="warning">업로드 관리에 유튜브 주소가 없는 업로드 {data.missingUrl}개는 분석에 넣지 못했습니다. 주소를 넣으면 다음부터 함께 계산합니다.</Notice>}
      {tab === "overview" && <Overview data={data} />}
      {tab === "patterns" && <Patterns data={data} />}
      {tab === "compare" && <Compare />}
      {tab === "hooks" && <HookLab />}
    </div>
  );
}

function VideoList({ videos }: { videos: { title: string; url: string; views: number | null; durationSec: number; thumbnailUrl: string | null; hook?: string | null }[] }) {
  return (
    <ul className="space-y-2">
      {videos.map((v) => (
        <li key={v.url} className="flex items-center gap-3 text-[13px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" /> : <div className="h-10 w-16 shrink-0 rounded bg-muted" />}
          <div className="min-w-0 flex-1">
            <a href={v.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
              {v.title}
            </a>
            {v.hook && <p className="truncate text-[11.5px] text-fg-subtle">Hook: {v.hook}</p>}
          </div>
          <span className="text-[11.5px] text-fg-subtle">{v.durationSec}초</span>
          <span className="tabular w-20 text-right font-semibold">{num(v.views)}</span>
        </li>
      ))}
    </ul>
  );
}

function Overview({ data }: { data: MyVideos }) {
  if (!data.videos.length)
    return <EmptyState icon={BarChart3} title="분석할 유튜브 영상이 없습니다" description="업로드 관리에 유튜브 주소가 있는 '업로드 완료' 기록이 생기면 여기서 숫자를 봅니다. [유튜브에 올리기]로 올린 영상은 자동으로 기록됩니다." />;
  const total = data.videos.reduce((s, v) => s + (v.views ?? 0), 0);
  const week = data.videos.filter((v) => Date.parse(data.at) - Date.parse(v.publishedAt) < 7 * 86_400_000).length;
  return (
    <div className="space-y-4" data-analytics-overview>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="분석한 영상" value={data.videos.length} unit="개" hint={`패턴 계산 ${data.counted}개 (2일 지난 것)`} />
        <StatTile label="총 조회수" value={num(total)} />
        <StatTile label="조회수 중앙값" value={num(data.overallMedian)} hint="배수의 기준 (×1.0)" />
        <StatTile label="최근 7일 올린 영상" value={`${week} / 7`} hint="주 7개 목표" />
      </div>
      <SectionCard title="이번 주 7개 계획 틀" description="넓게(조회수) 3 · 좁게(살 사람) 3 · 실험 1. 실험 주제는 [패턴 찾기]의 AI 가설에서 고르세요. 조회수보다 문의·구매로 이어지는지가 목표입니다.">
        <div className="grid gap-2 sm:grid-cols-3">
          {WEEKLY_PLAN.map((p) => (
            <div key={p.kind} className="rounded-control border border-line p-3">
              <p className="text-[13px] font-semibold">
                {p.kind} <span className="text-brand">{p.count}개</span>
              </p>
              <p className="mt-1 text-[12px] text-fg-subtle">{p.desc}</p>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="잘된 영상 TOP 10" description="현재 조회수 순. 숫자는 YouTube 공개 통계입니다.">
        <VideoList videos={data.videos.slice(0, 10)} />
      </SectionCard>
    </div>
  );
}

function Patterns({ data }: { data: MyVideos }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hyps, setHyps] = useState<{ title: string; evidence: string; test: string }[] | null>(null);
  async function find() {
    setBusy(true);
    setErr(null);
    try {
      setHyps((await call<{ hypotheses: { title: string; evidence: string; test: string }[] }>({ action: "hypotheses" })).hypotheses);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "가설을 찾지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const groups = [...new Set(data.rows.map((r) => r.group))];
  return (
    <div className="space-y-4" data-analytics-patterns>
      <SectionCard
        title="특징별 조회수 배수"
        description={`그 특징을 가진 영상의 조회수 중앙값 ÷ 전체 중앙값(${num(data.overallMedian)}회). 초록 = 1.3배 이상, 빨강 = 0.7배 이하. 표본이 3개보다 적으면 회색으로 참고만 하세요.`}
      >
        {!data.rows.length ? (
          <p className="text-[13px] text-fg-subtle">올린 지 2일 지난 영상이 생기면 계산합니다.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-[12.5px] font-semibold">{g}</p>
                <ul className="space-y-1">
                  {data.rows
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
                        <span className="min-w-0 flex-1 truncate">{r.label}</span>
                        <span className="text-[11.5px] text-fg-subtle">n={r.n}</span>
                        <Badge tone={ratioTone(r)}>×{r.ratio.toFixed(2)}</Badge>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <SectionCard title="AI 가설 찾기" description="위 표와 잘된·안 된 영상을 AI 가 보고 다음 주 '실험' 1개로 시험할 가설 3~5개를 만듭니다 (누를 때 AI 1번).">
        <Button variant="primary" icon={Sparkles} loading={busy} onClick={() => void find()} data-analytics-hyp>
          AI 가설 찾기
        </Button>
        {err && <Notice tone="warning" className="mt-2">{err}</Notice>}
        {hyps && (
          <ol className="mt-3 space-y-2">
            {hyps.map((h, i) => (
              <li key={i} className="rounded-control border border-line p-3 text-[13px]">
                <p className="font-semibold">
                  {i + 1}. {h.title}
                </p>
                <p className="mt-1 text-[12px] text-fg-subtle">근거: {h.evidence}</p>
                <p className="mt-1 text-[12px]">시험: {h.test}</p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

function Compare() {
  const [channel, setChannel] = useState("");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ channelTitle: string | null; theirs: CompareVideo[]; mine: CompareVideo[] } | null>(null);
  const [diffs, setDiffs] = useState<{ point: string; theirs: string; mine: string; tryNext: string }[] | null>(null);
  async function fetchTheirs() {
    setBusy(true);
    setErr(null);
    setDiffs(null);
    try {
      setRes(await call({ action: "competitor", channel: channel.trim() || undefined, urls: channel.trim() ? undefined : urls }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function findDiffs() {
    if (!res) return;
    setAiBusy(true);
    setErr(null);
    try {
      setDiffs((await call<{ differences: { point: string; theirs: string; mine: string; tryNext: string }[] }>({ action: "compare", theirs: res.theirs, mine: res.mine })).differences);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "차이를 찾지 못했습니다.");
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <div className="space-y-4" data-analytics-compare>
      <SectionCard title="경쟁 채널 불러오기" description="채널 주소(youtube.com/@이름)나 @핸들을 넣으면 최근 6개월 중 잘된 쇼츠 5개를, 또는 영상 주소를 여러 개 넣으면 그 영상들을 불러옵니다 (YouTube 무료 할당량, AI 없음).">
        <div className="space-y-2">
          <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="예: https://www.youtube.com/@채널이름 또는 @채널이름" aria-label="경쟁 채널" />
          {!channel.trim() && <Textarea rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="또는 경쟁 영상 주소 (한 줄에 하나, 최대 20개)" aria-label="경쟁 영상 주소" />}
          <Button variant="secondary" icon={Swords} loading={busy} onClick={() => void fetchTheirs()} data-analytics-competitor>
            불러오기
          </Button>
        </div>
        {err && <Notice tone="warning" className="mt-2">{err}</Notice>}
      </SectionCard>
      {res && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={`경쟁 ${res.channelTitle ? `· ${res.channelTitle}` : ""} 잘된 영상`}>
              <VideoList videos={res.theirs} />
            </SectionCard>
            <SectionCard title="내 잘된 영상 5개">{res.mine.length ? <VideoList videos={res.mine} /> : <p className="text-[13px] text-fg-subtle">아직 분석할 내 영상이 없습니다.</p>}</SectionCard>
          </div>
          <SectionCard title="차이 가설 찾기" description="두 묶음의 제목 구조·첫 문장·길이·주제 넓이·섬네일 글 차이를 AI 가 찾고, 다음 영상에서 시험할 것을 제안합니다 (누를 때 AI 1번).">
            <Button variant="primary" icon={Sparkles} loading={aiBusy} onClick={() => void findDiffs()} data-analytics-diff>
              차이 가설 찾기
            </Button>
            {diffs && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-fg-subtle">
                    <tr>
                      <th className="py-1 pr-2">무엇이 다른가</th>
                      <th className="py-1 pr-2">경쟁</th>
                      <th className="py-1 pr-2">나</th>
                      <th className="py-1">다음에 시험</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2 font-semibold">{d.point}</td>
                        <td className="py-1.5 pr-2">{d.theirs}</td>
                        <td className="py-1.5 pr-2">{d.mine}</td>
                        <td className="py-1.5 text-brand">{d.tryNext}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function HookLab() {
  const [hooks, setHooks] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMine, setLoadingMine] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ structures: { name: string; formula: string; examples: string[]; share: string }[]; variants: { text: string; structure: string }[] } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [formats, setFormats] = useState<{ id: string; name: string }[]>([]);
  const [formatId, setFormatId] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const count = hooks.split("\n").filter((h) => h.trim()).length;
  async function loadMine() {
    setLoadingMine(true);
    try {
      const r = await call<{ hooks: { text: string }[] }>({ action: "hookSources" });
      const lines = [...new Set([...hooks.split("\n").map((h) => h.trim()).filter(Boolean), ...r.hooks.map((h) => h.text)])].slice(0, 100);
      setHooks(lines.join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoadingMine(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const r = await call<NonNullable<typeof res>>({ action: "hookLab", hooks: hooks.split("\n"), topic });
      setRes(r);
      setPicked(new Set());
      if (!formats.length) {
        const f = await fetch("/api/script-formats", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        const list = ((f?.data ?? []) as { id: string; name: string }[]).map((x) => ({ id: x.id, name: x.name }));
        setFormats(list);
        setFormatId(list[0]?.id ?? "");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "분석하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!res) return;
    try {
      const r = await call<{ added: number; formatName: string }>({ action: "saveHooks", formatId, hooks: [...picked].map((i) => res.variants[i]?.text).filter(Boolean) });
      setSaved(`'${r.formatName}' 포맷 Hook 에 ${r.added}개를 더했습니다. 다음 원고부터 쓰입니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했습니다.");
    }
  }
  return (
    <div className="space-y-4" data-analytics-hooks>
      <SectionCard title="Hook 모으기" description="잘된 영상의 첫 문장·제목을 한 줄에 하나씩 최대 100개. [내 영상 Hook 불러오기]로 내 것을 넣고, 경쟁 채널 제목도 붙여 넣으세요.">
        <div className="space-y-2">
          <Textarea rows={8} value={hooks} onChange={(e) => setHooks(e.target.value)} placeholder={"예: 이거 모르고 사면 10만 원 손해입니다\n에어컨 청소, 이 3곳만 하세요"} aria-label="Hook 목록" />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" loading={loadingMine} onClick={() => void loadMine()} data-analytics-hook-mine>
              내 영상 Hook 불러오기
            </Button>
            <span className="text-[12px] text-fg-subtle">{count} / 100개</span>
          </div>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="새 Hook 을 만들 주제·제품 (예: 무선 청소기)" aria-label="주제" />
          <Button variant="primary" icon={FlaskConical} loading={busy} disabled={count < 3} onClick={() => void analyze()} data-analytics-hook-go>
            구조 분석 + 변형 10개 만들기
          </Button>
        </div>
        {err && <Notice tone="warning" className="mt-2">{err}</Notice>}
      </SectionCard>
      {res && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="잘되는 Hook 구조">
            <ul className="space-y-2.5 text-[13px]">
              {res.structures.map((s) => (
                <li key={s.name}>
                  <p className="font-semibold">
                    {s.name} <span className="text-[11.5px] font-normal text-fg-subtle">· {s.share}</span>
                  </p>
                  <p className="text-brand">{s.formula}</p>
                  {s.examples.slice(0, 3).map((e) => (
                    <p key={e} className="truncate text-[12px] text-fg-subtle">
                      예) {e}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="새 Hook 10개" description="마음에 드는 것을 골라 대본 포맷 Hook 에 저장하면 다음 원고부터 씁니다.">
            <ul className="space-y-1.5">
              {res.variants.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.has(i)}
                    onChange={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    aria-label={`Hook ${i + 1} 고르기`}
                  />
                  <span className="flex-1">
                    {v.text} <span className="text-[11px] text-fg-subtle">({v.structure})</span>
                  </span>
                </li>
              ))}
            </ul>
            {formats.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select className="w-56" value={formatId} onChange={(e) => setFormatId(e.target.value)} options={formats.map((f) => ({ value: f.id, label: f.name }))} aria-label="저장할 대본 포맷" />
                <Button size="sm" variant="primary" disabled={!picked.size || !formatId} onClick={() => void save()} data-analytics-hook-save>
                  고른 {picked.size}개 포맷에 저장
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-fg-subtle">대본 포맷이 없어 저장할 곳이 없습니다. AI 학습 관리에서 포맷을 만들어 주세요.</p>
            )}
            {saved && <p className="mt-2 text-[12px] text-success">{saved}</p>}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
