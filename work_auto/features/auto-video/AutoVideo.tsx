"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Play, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { Badge, Button, CopyButton, EmptyState, ErrorState, Input, LoadingState, Modal, Notice, SectionCard, SegmentedControl, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

/** 제품 홍보 영상 자동 제작 (v0.9.107) — 설정 + 아침 보고 (영상·제목·설명·키워드·태그 → 업로드 관리 예약) */
interface Settings {
  enabled: boolean;
  count: number;
  length: "15s" | "30s";
  updatedAt: string | null;
  updatedBy: string | null;
}
interface Item {
  id: string;
  productId: string;
  productName: string;
  keyword: string;
  reason: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  source?: "schedule" | "test";
  videos?: number;
  step?: string;
  error?: string | null;
  title?: string | null;
  description?: string | null;
  keywords?: string[];
  tags?: string[];
  videoKey?: string | null;
  jobStatus?: string | null;
  issues?: string[];
  publicationId?: string | null;
  hook?: string | null;
  cta?: string | null;
  script?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}
interface Data {
  settings: Settings;
  dates: string[];
  date: string;
  today: string;
  run: { date: string; createdAt: string; items: Item[]; note?: string | null; scheduledAt?: string | null } | null;
  urls: Record<string, string>;
  limits: { maxCount: number; repeatDays: number; minVideos: number };
  eligibility: { total: number; eligible: number; noVideo: number; fewVideo: number; recent: number } | null;
  ready: { automation: boolean; cron: boolean };
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
  if (!body?.ok) throw new Error(body?.error?.message ?? `서버 오류 (HTTP ${res.status})`);
  return body.data as T;
}

const STATUS: Record<Item["status"], { label: string; tone: "neutral" | "info" | "success" | "danger" | "warning" }> = {
  pending: { label: "대기", tone: "neutral" },
  running: { label: "만드는 중", tone: "info" },
  done: { label: "완료", tone: "success" },
  failed: { label: "실패", tone: "danger" },
  skipped: { label: "건너뜀", tone: "warning" },
};

/** 내일 오전 9시 (현지 시각) — 예약 기본값 */
const defaultSlot = (k: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9 + k * 2, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
};

export function AutoVideo() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [testCount, setTestCount] = useState(1);
  const load = useCallback(async (d?: string) => {
    try {
      setError(null);
      const r = await call<Data>(`/api/auto-video${d ? `?date=${d}` : ""}`);
      setData(r);
      setDate(r.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    void (async () => load())();
  }, [load]);
  // 오늘 만드는 중이면 15초마다 새로 (외부 호출 없음)
  const live = Boolean(data && data.date === data.today && data.run?.items.some((x) => x.status === "running" || x.status === "pending"));
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(date), 15_000);
    return () => clearInterval(t);
  }, [live, load, date]);

  async function save(patch: Partial<Settings>) {
    if (!data) return;
    setBusy("설정");
    try {
      const r = await call<{ settings: Settings }>("/api/auto-video", { method: "PATCH", body: JSON.stringify({ ...data.settings, ...patch }) });
      setData({ ...data, settings: r.settings });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }
  async function remove(itemId?: string) {
    if (!data) return;
    const msg = itemId ? "이 결과를 지울까요? (완성 영상 파일도 지웁니다. 업로드 관리 예약은 그대로)" : `${data.date} 결과를 모두 지울까요? (완성 영상 파일도 지웁니다. 만드는 중인 항목은 남깁니다)`;
    if (!window.confirm(msg)) return;
    setBusy("지우기");
    try {
      await call(`/api/auto-video?date=${data.date}${itemId ? `&itemId=${itemId}` : ""}`, { method: "DELETE" });
      await load(data.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : "지우지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }
  async function runNow() {
    setAsk(false);
    setBusy("시험");
    try {
      await call("/api/auto-video/run-now", { method: "POST", body: JSON.stringify({ confirmed: true, count: testCount }) });
      await load(data?.today);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실행하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <ErrorState message={error} onRetry={() => void load()} /> : <LoadingState />;
  const s = data.settings;
  const items = data.run?.items ?? [];
  return (
    <div className="space-y-6" data-auto-video>
      {error && <Notice tone="warning">{error}</Notice>}
      <SectionCard title="자동 제작 설정" icon={Settings2} description={`매일 05:00 AI 가 샤오홍슈 공유 링크(xhslink) 영상이 ${data.limits.minVideos}개 이상인 제품만 골라(연결 안 된·만료 링크뿐인 제품은 만들지 않음, 최근 ${data.limits.repeatDays}일 안에 만든 제품 제외) 05:05부터 5분마다 1개씩 만듭니다. 목소리·자막·제목 스타일은 가장 최근에 직접 만든 영상 설정을 따릅니다. 샤오홍슈 영상은 무료로 받을 수 있는 것만 쓰고, TikHub(유료)가 필요한 영상은 건너뜁니다.`} data-auto-settings>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-[14px] font-medium">
            <input type="checkbox" checked={s.enabled} disabled={Boolean(busy)} onChange={(e) => void save({ enabled: e.target.checked })} className="size-4 accent-[var(--color-brand)]" data-auto-enabled />
            매일 자동 제작 {s.enabled ? "켜짐" : "꺼짐"}
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">하루 개수</span>
            <Select value={String(s.count)} options={Array.from({ length: data.limits.maxCount }, (_, i) => ({ value: String(i + 1), label: `${i + 1}개` }))} onChange={(e) => void save({ count: Number(e.target.value) })} className="w-24" aria-label="하루 개수" />
          </label>
          <div className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">원고 길이</span>
            <SegmentedControl value={s.length} onChange={(v) => void save({ length: v as Settings["length"] })} options={[{ value: "15s", label: "15초" }, { value: "30s", label: "30초" }]} />
          </div>
          <span className="text-[12px] text-fg-subtle">{s.updatedAt ? `저장 ${new Date(s.updatedAt).toLocaleString("ko-KR")} · ${s.updatedBy ?? ""}` : "아직 저장 안 함"}</span>
          <Button variant="secondary" icon={Play} className="ml-auto" disabled={Boolean(busy)} loading={busy === "시험"} onClick={() => setAsk(true)} data-auto-run-now>
            지금 시험 실행
          </Button>
        </div>
        {(!data.ready.automation || !data.ready.cron) && (
          <Notice tone="warning" className="mt-3">
            새벽 자동 실행 준비가 덜 됐습니다: {!data.ready.automation && "자동화 계정(AUTOMATION_EMAIL·AUTOMATION_PASSWORD) "}{!data.ready.cron && "CRON_SECRET "}환경변수를 Vercel 에 넣어 주세요. [지금 시험 실행]은 지금 로그인한 계정으로 동작합니다.
          </Notice>
        )}
        {data.eligibility && (
          <p className="mt-3 text-[13px]" data-auto-eligibility>
            지금 만들 수 있는 제품 <b className={data.eligibility.eligible ? "text-success" : "text-danger"}>{data.eligibility.eligible}개</b> / 전체 {data.eligibility.total}개
            <span className="text-fg-subtle">
              {" "}
              (제외: 공유 링크(xhslink) 영상 없음 {data.eligibility.noVideo}개 · {data.limits.minVideos}개 미만 {data.eligibility.fewVideo}개 · 최근 {data.limits.repeatDays}일 안에 만듦 {data.eligibility.recent}개)
            </span>
            {data.eligibility.eligible < s.count && <span className="text-warning"> — 하루 개수({s.count}개)보다 적어 그만큼만 만듭니다. 제품 상세 › 연결된 영상에서 샤오홍슈 영상을 연결하고, [만료되는 링크]는 [공유 링크로 바꾸기]로 xhslink 주소를 넣어 주세요.</span>}
          </p>
        )}
        <p className="mt-3 text-[12px] text-fg-subtle">비용(영상 1개): AI 글 약 4~5회 + AI 음성 1편 + 샤오홍슈 글자 확인(AI 이미지 읽기, 처음 쓰는 영상만). YouTube 검색은 무료 한도 안. 완성 영상 파일은 7일 동안 보관됩니다 (받으면 1시간 뒤 지움).</p>
      </SectionCard>

      <SectionCard
        title={`${data.date === data.today ? "오늘" : data.date} 결과 · ${items.filter((x) => x.status === "done").length}/${items.length}개 완성`}
        icon={CalendarClock}
        actions={
          <span className="flex items-center gap-1.5">
            <Select value={date} options={[...new Set([data.today, ...data.dates])].map((d) => ({ value: d, label: d === data.today ? `${d} (오늘)` : d }))} onChange={(e) => void load(e.target.value)} className="h-8 w-44" aria-label="날짜" />
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void load(date)} aria-label="새로고침" />
            {items.length > 0 && (
              <Button size="sm" variant="ghost" icon={Trash2} disabled={Boolean(busy)} onClick={() => void remove()} data-auto-delete-all>
                이날 결과 모두 지우기
              </Button>
            )}
          </span>
        }
        data-auto-report
      >
        <p className="mb-3 text-[12.5px] text-fg-muted" data-auto-scheduled>
          새벽 자동 실행 (05:00): {data.run?.scheduledAt ? <b className="text-success">이날 실행함 ({new Date(data.run.scheduledAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})</b> : data.date === data.today ? <b>{s.enabled ? "아직 안 함 (05:00 에 실행 — 시험 실행과 따로)" : "꺼져 있음"}</b> : "이날은 실행하지 않음"}
          {" · "}새벽 자동 {items.filter((x) => x.source === "schedule").length}개 · 시험 실행 {items.filter((x) => x.source !== "schedule").length}개
        </p>
        {data.run?.note && <Notice tone="info" className="mb-3">{data.run.note}</Notice>}
        {!items.length ? (
          <EmptyState compact title="이날 만든 영상이 없습니다" description={s.enabled ? "매일 05:00 에 시작합니다. 지금 보려면 [지금 시험 실행]을 눌러 주세요." : "자동 제작을 켜면 매일 05:00 에 시작합니다."} />
        ) : (
          <ol className="space-y-4">
            {items.map((it, k) => (
              <ReportItem key={it.id} it={it} k={k} url={it.videoKey ? data.urls[it.videoKey] : undefined} date={data.date} onDone={() => void load(date)} onError={setError} onRemove={() => void remove(it.id)} />
            ))}
          </ol>
        )}
      </SectionCard>

      <Modal
        open={ask}
        onClose={() => setAsk(false)}
        title="지금 시험 실행"
        description="새 제품을 골라(오늘·최근 7일 안에 만든 제품 제외) 1개를 바로 만듭니다 (5~10분). '시험 실행'으로 따로 표시되고, 새벽 자동 실행(05:00)은 이것과 상관없이 설정한 개수를 따로 고릅니다. AI 글·AI 음성 비용이 듭니다."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsk(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={() => void runNow()} data-auto-run-confirm>
              실행
            </Button>
          </>
        }
      >
        <label className="flex items-center gap-2 text-[13px]">
          새로 고를 제품 수 (남은 항목이 없을 때)
          <Select value={String(testCount)} options={[1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: `${n}개` }))} onChange={(e) => setTestCount(Number(e.target.value))} className="h-8 w-20" />
        </label>
        <p className="mt-2 text-[12px] text-fg-subtle">지금은 1개만 만들고, 남은 시험 항목은 다시 누르면 이어서 만듭니다. 시험으로 만든 제품은 7일 동안 새벽 자동에서 다시 고르지 않습니다 (같은 제품 중복 방지).</p>
      </Modal>
    </div>
  );
}

function ReportItem({ it, k, url, date, onDone, onError, onRemove }: { it: Item; k: number; url?: string; date: string; onDone: () => void; onError: (m: string) => void; onRemove: () => void }) {
  const [at, setAt] = useState(() => defaultSlot(k));
  const [busy, setBusy] = useState(false);
  const st = STATUS[it.status];
  async function schedule() {
    setBusy(true);
    try {
      await call("/api/auto-video/schedule", { method: "POST", body: JSON.stringify({ date, itemId: it.id, scheduledAt: new Date(at).toISOString() }) });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "예약하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={cn("rounded-control border p-3", it.status === "done" ? "border-success/50" : it.status === "failed" ? "border-danger/50" : "border-line")} data-auto-item>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="tabular font-semibold text-fg-subtle">{k + 1}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={it.source === "schedule" ? "brand" : "neutral"}>{it.source === "schedule" ? "새벽 자동" : "시험 실행"}</Badge>
        <span className="font-semibold">{it.productName}</span>
        <span className="text-fg-subtle">키워드 {it.keyword}</span>
        {it.videos != null && <span className="text-fg-subtle">· 샤오홍슈 영상 {it.videos}개</span>}
        {it.status === "running" && it.step && <span className="text-info">· {it.step}</span>}
        {it.publicationId && <Badge tone="brand">업로드 관리 예약됨</Badge>}
        {it.status !== "running" && (
          <button type="button" className="ml-auto inline-flex items-center gap-1 text-[12px] text-fg-subtle hover:text-danger" onClick={onRemove} data-auto-delete>
            <Trash2 className="size-3.5" /> 지우기
          </button>
        )}
      </div>
      {it.reason && <p className="mb-2 text-[12px] text-fg-subtle">고른 이유: {it.reason}</p>}
      {it.error && <p className="text-[12px] text-danger">실패: {it.error}</p>}
      {it.status === "done" && (
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          {url ? <video src={url} controls playsInline preload="metadata" className="aspect-[9/16] w-full max-w-[240px] rounded bg-black" /> : <div className="flex aspect-[9/16] w-full max-w-[240px] items-center justify-center rounded bg-subtle text-[12px] text-fg-subtle">영상 파일 없음 (7일 지남)</div>}
          <div className="min-w-0 space-y-2 text-[13px]">
            {it.issues && it.issues.length > 0 && <Notice tone="warning">{it.issues.slice(0, 3).join(" · ")}</Notice>}
            <Field label="업로드 제목" value={it.title ?? ""} />
            {it.script && <Field label={`대본 (${it.script.split("\n").filter(Boolean).length}줄 = 컷)`} value={it.script} multiline />}
            {(it.hook || it.cta) && <Field label="Hook · CTA (대본 포맷에서 고름)" value={[it.hook ? `Hook: ${it.hook}` : "", it.cta ? `CTA: ${it.cta}` : ""].filter(Boolean).join("\n")} multiline />}
            <Field label="설명 (YouTube 설명란)" value={it.description ?? ""} multiline />
            <Field label={`키워드 ${it.keywords?.length ?? 0}개`} value={(it.keywords ?? []).join(", ")} />
            <Field label={`태그 ${it.tags?.length ?? 0}개`} value={(it.tags ?? []).join(", ")} />
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
              {url && (
                <a href={url} download target="_blank" rel="noreferrer" className="text-[13px] text-brand hover:underline">
                  MP4 받기
                </a>
              )}
              <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-8 w-52" aria-label="예약 시각" />
              <Button size="sm" variant="primary" icon={CalendarPlus} loading={busy} disabled={Boolean(it.publicationId)} onClick={() => void schedule()} data-auto-schedule>
                {it.publicationId ? "예약됨" : "업로드 관리에 예약"}
              </Button>
              <span className="text-[11.5px] text-fg-subtle">YouTube 자동 업로드는 Google 검수 후 붙입니다 (지금은 직접 업로드).</span>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-control border border-line p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[12px] font-medium text-fg-muted">{label}</span>
        <CopyButton value={value} className="ml-auto" />
      </div>
      <p className={cn("text-[13px] text-fg", multiline ? "max-h-40 overflow-y-auto whitespace-pre-line" : "line-clamp-2")}>{value || "—"}</p>
    </div>
  );
}
