import "server-only";
import { NAVER_LIST_COUNTS, SEASON_LABEL, buildTrendIdeas, relatedFirst, seasonOf, seasonalCandidates } from "@/lib/domain/naver-trend-lists";
import { categorySeedKeywords } from "@/lib/mock/naver-trends";
import { hasExcluded } from "@/lib/types/profile";
import type { Keyword, NaverKeywordStats, NaverRisingTopic, NaverTrendInsight, NaverTrendMore, NaverTrendQuery, NaverTrendSection } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import type { NaverTrendProvider } from "../types";
import { SearchAdError, fetchKeywordTool, type SearchAdCredentials, type SearchAdKeyword } from "./naver-searchad";

/**
 * NAVER 실제 데이터 Provider. (YouTube 분석과 로직을 공유하지 않는다)
 *
 * 콘텐츠 프로필은 "무엇을 조사할지"(후보 키워드)만 준다. 조사 방법은 아래와 같다.
 *  1) 후보 키워드: 검색어 → 없으면 프로필의 관심 키워드·세부 관심분야 → 없으면 카테고리 기본 키워드
 *  2) 검색광고 API 키워드도구: 후보의 연관 키워드 + 월간 검색량 + 경쟁도 (키가 있을 때만)
 *  3) 데이터랩 검색어트렌드:
 *     - 검색 추이: 검색어의 기간 내 상대 지수 (7일 ~ 3년)
 *     - 급상승: 후보 키워드 각각의 "기간 끝 1/4 평균 ÷ 앞부분 평균"
 *     - 시즌: 작년 이번 달·다음 달 지수 ÷ 연평균이 높은 후보 → 부족하면 지금 계절에 많이 찾는 키워드(분야별 목록)로 채운다
 *  4) 블로그 검색 API: 검색어의 블로그 누적 문서 수 (발행량 지표)
 *  5) 글감 아이디어: 위 키워드로 규칙 기반 생성 (AI 호출 없음, 비용 0)
 *  목록은 각 최대 30개 (NAVER_LIST_COUNTS). 검색어가 있으면 관련 검색어는 검색어가 들어간 것을 먼저 보여 준다.
 *  제외 키워드가 들어간 키워드는 모든 목록에서 뺀다.
 *
 * 호출량: 첫 조회 ≈ 데이터랩 6회 (급상승 후보 15 ÷ 5 + 시즌 후보 10 ÷ 5 + 추이 1, 동시에 4개씩), [더보기] 때 모자라면 3회씩 더 + 검색광고 1회 + 자동완성 1회 + 블로그 검색 1회. 같은 조건은 6시간 캐시.
 * (데이터랩 하루 1,000회, 검색 API 하루 25,000회)
 */

const DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";
const BLOG_URL = "https://openapi.naver.com/v1/search/blog.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** 한 번에 보여 주는 개수 (처음, [더보기] 마다) */
const PAGE = 10;
/** 급상승: 한 번에 계산하는 후보 수 (데이터랩 3회). 처음 1묶음, [더보기]에 모자라면 다음 묶음 */
const RISING_BATCH = 15;
/** 급상승 후보 전체 (출발점 + 연관 키워드) */
const MAX_POOL = 60;
/** 관련 키워드 최대 */
const MAX_RELATED = 60;
/** 시즌(월별 지수) 계산에 쓰는 후보 수. 모자라면 계절 키워드 목록으로 채우므로 앞쪽만 본다 */
const SEASON_CANDIDATES = 10;
/** 데이터랩 동시 호출 수 */
const DATALAB_CONCURRENCY = 4;

const cache = new Map<string, { at: number; value: NaverTrendInsight }>();
const acCache = new Map<string, { at: number; value: string[] }>();

type Series = { period: string; ratio: number }[];

/** NAVER 오류 응답 → 사용자 안내 (키 값은 절대 넣지 않는다) */
function describeNaverError(status: number, body: { errorCode?: string; errorMessage?: string } | null, api = "데이터랩(검색어트렌드)"): string {
  const code = body?.errorCode ? ` [${body.errorCode}]` : "";
  const raw = body?.errorMessage ? ` · NAVER 메시지: ${body.errorMessage}` : "";
  if (status === 401) {
    return `Client ID 또는 Client Secret 이 올바르지 않습니다. NAVER 개발자센터 → 내 애플리케이션에서 값을 다시 복사해 주세요.${code}${raw}`;
  }
  if (status === 403) {
    return `이 애플리케이션에 '${api}' API 가 등록되어 있지 않습니다. NAVER 개발자센터 → 내 애플리케이션 → API 설정 → 사용 API 에 '${api}' 를 추가해 주세요.${code}${raw}`;
  }
  if (status === 429) return `NAVER API 하루 호출 한도를 넘었습니다. 내일 다시 시도해 주세요.${code}${raw}`;
  return `NAVER 응답 오류 (HTTP ${status})${code}${raw}`;
}

class NaverHttpError extends Error {}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.replace(/\s+/g, "").toLowerCase(), x.trim()])).values()].filter(Boolean);

/** 기간 끝 1/4 의 평균이 앞부분 평균보다 몇 % 높은가 */
function growthOf(series: Series): number {
  const values = series.map((s) => s.ratio);
  if (values.length < 4) return 0;
  const cut = Math.max(1, Math.round(values.length / 4));
  const recent = avg(values.slice(-cut));
  const before = avg(values.slice(0, -cut));
  if (before <= 0) return recent > 0 ? 300 : 0;
  return Math.round((recent / before - 1) * 100);
}

function chartLabel(period: string, timeUnit: string): string {
  const [y, m, d] = period.split("-");
  if (timeUnit === "month") return `${y.slice(2)}.${m}`;
  return `${Number(m)}/${Number(d)}`;
}

export class NaverApiProvider implements NaverTrendProvider {
  readonly id = "naver-open-api";
  readonly kind = "naver-trend" as const;
  readonly label = "NAVER Open API";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly searchAd: SearchAdCredentials | null = null,
  ) {}

  private headers() {
    return {
      "X-Naver-Client-Id": this.clientId,
      "X-Naver-Client-Secret": this.clientSecret,
      "Content-Type": "application/json",
    };
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      await this.datalab([{ groupName: "연결테스트", keywords: ["날씨"] }], 8, "date");
    } catch (e) {
      const message = e instanceof NaverHttpError ? e.message : "NAVER 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
      return { ok: false, message, testedAt, mock: false };
    }
    const parts = ["데이터랩(검색어트렌드) 연결 성공"];
    const blog = await this.blogDocCount("가전").then(
      () => "블로그 검색 연결 성공",
      (e: unknown) => (e instanceof NaverHttpError ? `블로그 검색 실패: ${e.message}` : "블로그 검색 실패"),
    );
    parts.push(blog);
    if (this.searchAd) {
      parts.push(
        await fetchKeywordTool(this.searchAd, ["가전"]).then(
          () => "검색광고 API(검색량) 연결 성공",
          (e: unknown) => `검색광고 API 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        ),
      );
    } else {
      parts.push("검색광고 API 미연결 (검색량·연관 키워드 없이 동작. 'NAVER 검색광고 API' 카드에서 연결)");
    }
    return { ok: true, message: parts.join(" · "), testedAt, mock: false };
  }

  /* ───────── 외부 호출 ───────── */

  /** 데이터랩: 그룹 5개까지 한 번에. 끝 날짜는 어제 (오늘 데이터는 아직 없다). 한도 초과·서버 오류는 한 번 더 시도 */
  private async datalab(
    groups: { groupName: string; keywords: string[] }[],
    days: number,
    timeUnit: "date" | "week" | "month",
    endOffsetDays = 1,
  ): Promise<Map<string, Series>> {
    const end = new Date(Date.now() - endOffsetDays * 86_400_000);
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    const body = JSON.stringify({ startDate: ymd(start), endDate: ymd(end), timeUnit, keywordGroups: groups.slice(0, 5) });
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(DATALAB_URL, { method: "POST", headers: this.headers(), cache: "no-store", body });
      if (res.ok) {
        const data = (await res.json()) as { results?: { title: string; data?: Series }[] };
        return new Map((data.results ?? []).map((r) => [r.title, r.data ?? []]));
      }
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      const err = (await res.json().catch(() => null)) as { errorCode?: string; errorMessage?: string } | null;
      throw new NaverHttpError(describeNaverError(res.status, err));
    }
  }

  /** 데이터랩 동시 호출 제한 (한 조회 안의 모든 묶음이 함께 쓴다). 너무 많이 동시에 보내면 한도(429)에 걸린다 */
  private inFlight = 0;
  private waiters: (() => void)[] = [];
  private async limited<T>(fn: () => Promise<T>): Promise<T> {
    while (this.inFlight >= DATALAB_CONCURRENCY) await new Promise<void>((r) => this.waiters.push(r));
    this.inFlight++;
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.waiters.shift()?.();
    }
  }

  /** 키워드 여러 개를 각각 한 그룹으로 (5개씩). 묶음은 동시에 보내되 전체 동시 호출은 DATALAB_CONCURRENCY 까지 */
  private async seriesFor(keywords: string[], days: number, timeUnit: "date" | "week" | "month"): Promise<Map<string, Series>> {
    const chunks: string[][] = [];
    for (let i = 0; i < keywords.length; i += 5) chunks.push(keywords.slice(i, i + 5));
    const out = new Map<string, Series>();
    const maps = await Promise.all(
      chunks.map((c) => this.limited(() => this.datalab(c.map((k) => ({ groupName: k, keywords: [k] })), days, timeUnit))),
    );
    for (const m of maps) for (const [k, v] of m) out.set(k, v);
    return out;
  }

  /** 네이버 자동완성 (검색광고 키가 없을 때 관련 키워드 대신 쓴다. 검색량은 없다) */
  /**
   * 자동완성은 모든 사용자가 우리 서버 IP 로 부르는 비공식 경로라, 키워드별로 6시간 기억해 요청 수를 줄인다
   * (사용자 키를 쓰는 데이터랩과 달리 서버 IP 가 막히면 모두가 영향을 받는다).
   */
  private async autocomplete(keyword: string): Promise<string[]> {
    const key = keyword.trim().toLowerCase();
    const hit = acCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = await this.autocompleteFetch(keyword);
    acCache.set(key, { at: Date.now(), value });
    if (acCache.size > 2000) acCache.delete(acCache.keys().next().value!);
    return value;
  }

  private async autocompleteFetch(keyword: string): Promise<string[]> {
    const qs = new URLSearchParams({ q: keyword, st: "100", r_format: "json", r_enc: "UTF-8", q_enc: "UTF-8", r_unicode: "0", t_koreng: "1", ans: "2", run: "2", rev: "4", con: "0", frm: "nv" });
    const res = await fetch(`https://ac.search.naver.com/nx/ac?${qs.toString()}`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { items?: [string, string][][] } | null;
    return (data?.items?.[0] ?? []).map((x) => x[0]).filter(Boolean);
  }

  private async blogDocCount(keyword: string): Promise<number> {
    const res = await fetch(`${BLOG_URL}?${new URLSearchParams({ query: keyword, display: "1" }).toString()}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { errorCode?: string; errorMessage?: string } | null;
      throw new NaverHttpError(describeNaverError(res.status, body, "검색"));
    }
    return ((await res.json()) as { total?: number }).total ?? 0;
  }

  /* ───────── 인사이트 ───────── */

  /**
   * 조회 준비: 출발점·연관 키워드·후보 목록 (검색광고·자동완성). 같은 조건은 6시간 기억해 [더보기]에서 다시 쓴다.
   */
  private async prepare(query: NaverTrendQuery): Promise<TrendState> {
    const kw = query.keyword?.trim() ?? "";
    const scope = query.profileScope ?? null;
    const exclude = scope?.excludeKeywords ?? [];
    const key = stateKey(query, Boolean(this.searchAd));
    const hit = stateCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

    const notes: string[] = [];
    const ok = (k: string) => !hasExcluded(k, exclude);
    // 1) 조사 출발점: 검색어 → 프로필 관심 키워드·세부 관심분야 → 카테고리 기본 키워드
    const seeds = uniq(
      kw ? [kw] : scope ? [...scope.seedKeywords, ...scope.subCategories] : categorySeedKeywords(query.category ?? ""),
    ).filter(ok);
    if (!seeds.length) seeds.push(scope?.mainCategory ?? "가전");

    // 2) 연관 키워드 + 검색량: 검색광고 API → 없거나 실패하면 네이버 자동완성 (검색어 자동완성은 동시에 미리 시작)
    let related: SearchAdKeyword[] = [];
    let seedStats: SearchAdKeyword | undefined;
    let relatedFromAd = false;
    const acPromise = kw && this.searchAd ? this.autocomplete(kw).catch(() => [] as string[]) : Promise.resolve([] as string[]);
    if (this.searchAd) {
      try {
        const rows = await fetchKeywordTool(this.searchAd, seeds.slice(0, 5));
        seedStats = kw ? rows.find((r) => norm(r.text) === norm(kw)) : undefined;
        const seedSet = new Set(seeds.map(norm));
        related = rows.filter((r) => !seedSet.has(norm(r.text)) && ok(r.text)).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        relatedFromAd = true;
      } catch (e) {
        notes.push(e instanceof SearchAdError ? e.message : "검색광고 API 를 호출하지 못했습니다.");
      }
    }
    if (!relatedFromAd) {
      const lists = await Promise.all(seeds.slice(0, kw ? 1 : 4).map((s) => this.autocomplete(s).catch(() => [] as string[])));
      const seedSet = new Set(seeds.map(norm));
      related = uniq(lists.flat())
        .filter((t) => !seedSet.has(norm(t)) && ok(t))
        .map((text) => ({ text, source: "naver" as const, monthlyPc: 0, monthlyMobile: 0 }));
      notes.push(
        this.searchAd
          ? "관련 키워드는 네이버 자동완성으로 대신 보여줍니다 (검색량 없음)."
          : "검색광고 API 키가 없어 관련 키워드는 네이버 자동완성으로 보여주고, 월간 검색량은 표시하지 않습니다. (설정 → API 연결 센터 → NAVER 검색광고 API)",
      );
    }
    if (kw && relatedFromAd) {
      // 검색광고 연관 키워드는 검색량순이라 큰 일반 키워드(냉장고·에어컨 등)가 위에 몰린다 → 검색어 자동완성도 합친다
      const ac = await acPromise;
      const have = new Set(related.map((r) => norm(r.text)));
      for (const text of ac) {
        if (!have.has(norm(text)) && norm(text) !== norm(kw) && ok(text)) related.push({ text, source: "naver" as const, monthlyPc: 0, monthlyMobile: 0 });
      }
    }
    related = relatedFirst(related, kw);
    const volumeOf = new Map(related.filter((r) => r.volume).map((r) => [r.text, r]));
    const toKeyword = (text: string, growthRate?: number): Keyword => {
      const v = volumeOf.get(text) ?? (seedStats && text === kw ? seedStats : undefined);
      return { text, source: "naver", volume: v?.volume, growthRate, competition: v?.competition };
    };
    const state: TrendState = {
      at: Date.now(),
      kw,
      scope,
      category: query.category,
      seeds,
      related: related.slice(0, MAX_RELATED).map((r) => toKeyword(r.text)),
      relatedRaw: related.map((r) => r.text),
      // 3) 급상승 후보 = 출발점 + 연관 키워드 (앞에서부터 RISING_BATCH 개씩 계산한다)
      pool: uniq([...seeds, ...related.slice(0, MAX_POOL).map((r) => r.text)]).slice(0, MAX_POOL),
      computed: 0,
      ranked: [],
      ideas: [],
      seasonal: [],
      notes,
      seedStats,
      toKeyword,
    };
    stateCache.set(key, state);
    if (stateCache.size > 200) stateCache.delete(stateCache.keys().next().value!);
    return state;
  }

  /**
   * 급상승: 다음 후보 묶음의 증가율을 계산해 순위에 더한다.
   * 이미 보여 준 순위(앞쪽 shown 개)는 바꾸지 않고, 그 뒤에서만 다시 정렬한다 (더보기를 눌러도 위 목록이 흔들리지 않게).
   */
  private async rankMore(state: TrendState, periodDays: number, shown: number): Promise<void> {
    const batch = state.pool.slice(state.computed, state.computed + RISING_BATCH);
    if (!batch.length) return;
    state.computed += batch.length;
    const series = await this.seriesFor(batch, Math.min(periodDays, 90), "date").catch((e: unknown) => {
      state.notes.push(`급상승 키워드: ${e instanceof NaverHttpError ? e.message : "데이터랩 응답 오류"}`);
      return new Map<string, Series>();
    });
    const fresh = batch
      .filter((k) => (series.get(k) ?? []).some((p) => p.ratio > 0))
      .map((k) => state.toKeyword(k, growthOf(series.get(k) ?? [])));
    const head = state.ranked.slice(0, shown);
    const tail = [...state.ranked.slice(shown), ...fresh].sort((a, b) => (b.growthRate ?? 0) - (a.growthRate ?? 0));
    state.ranked = [...head, ...tail];
  }

  private topicsFrom(state: TrendState, list: Keyword[], startIndex: number): NaverRisingTopic[] {
    const now = new Date().toISOString();
    return list.map((k, i) => ({
      id: `nv_${seededNumber(k.text, 100000, 999999)}`,
      source: "naver",
      title: k.text,
      description: `최근 검색 지수가 앞선 기간보다 ${k.growthRate ?? 0}% ${(k.growthRate ?? 0) >= 0 ? "높습니다" : "낮습니다"}.${k.volume ? ` 월간 검색량 약 ${k.volume.toLocaleString("ko-KR")}회.` : ""}`,
      category: state.scope?.mainCategory ?? state.category ?? "",
      keywords: [k.text, ...state.relatedRaw.filter((r) => r.includes(k.text) && r !== k.text).slice(0, 3)],
      growthRate: k.growthRate ?? 0,
      trendScore: Math.max(30, 95 - (startIndex + i) * 2),
      collectedAt: now,
    }));
  }

  /**
   * 부분 실패에 강하게: 각 단계가 실패해도 나머지는 보여주고, 이유는 notes 에 남긴다.
   * 처음에는 급상승·관련·아이디어를 10개씩만 (급상승은 후보 15개만 계산) → [더보기] 때 더 계산한다.
   */
  async getInsight(query: NaverTrendQuery): Promise<NaverTrendInsight> {
    const key = stateKey(query, Boolean(this.searchAd));
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, query };

    const state = await this.prepare(query);
    const { kw, seeds, notes } = state;
    const scopeName = state.scope?.profileName ?? query.category ?? "카테고리";
    const periodDays = query.periodDays;
    const timeUnit = periodDays <= 90 ? "date" : periodDays <= 365 ? "week" : "month";
    const fail = (what: string) => (e: unknown) => {
      notes.push(`${what}: ${e instanceof NaverHttpError ? e.message : "데이터랩 응답 오류"}`);
      return new Map<string, Series>();
    };

    // 급상승(첫 묶음)·시즌·검색 추이·블로그 문서 수를 동시에 (데이터랩은 전체 동시 호출 DATALAB_CONCURRENCY 까지)
    const trendGroup = kw ? { groupName: kw, keywords: [kw] } : { groupName: scopeName, keywords: seeds.slice(0, 20) };
    const [trendSeries, , monthly, blogCount] = await Promise.all([
      this.limited(() => this.datalab([trendGroup], periodDays, timeUnit)).catch(fail("검색 추이")),
      state.computed === 0 ? this.rankMore(state, periodDays, 0) : Promise.resolve(),
      this.seriesFor(state.pool.slice(0, SEASON_CANDIDATES), 365, "month").catch(fail("시즌 키워드")),
      kw
        ? this.blogDocCount(kw).catch((e: unknown) => {
            notes.push(e instanceof NaverHttpError ? `블로그 문서 수: ${e.message}` : "블로그 문서 수를 가져오지 못했습니다.");
            return null;
          })
        : Promise.resolve(null),
    ]);
    if (state.computed > 0 && state.ranked.length === 0 && !notes.some((n) => n.startsWith("급상승"))) {
      notes.push("데이터랩에서 후보 키워드의 검색 데이터를 받지 못했습니다. 검색량이 적은 키워드일 수 있으니 프로필의 관심 키워드를 사람들이 실제로 검색하는 말로 바꿔 보세요.");
    }

    // 시즌: ① 후보 중 작년 이번 달·다음 달 지수가 연평균보다 높은 키워드 (데이터 근거)  ② 부족하면 지금 계절 키워드
    const ym = (offset: number) => {
      const d = new Date();
      d.setMonth(d.getMonth() + offset);
      return `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const [thisMonth, nextMonth] = [ym(0), ym(1)];
    const dataSeasonal = state.pool
      .slice(0, SEASON_CANDIDATES)
      .map((k) => {
        const series = monthly.get(k) ?? [];
        const base = avg(series.map((p) => p.ratio));
        const peak = Math.max(...[thisMonth, nextMonth].map((m) => series.find((p) => p.period.startsWith(m))?.ratio ?? 0));
        return { k, idx: base > 0 ? peak / base : 0 };
      })
      .filter((x) => x.idx >= 1.1)
      .sort((a, b) => b.idx - a.idx)
      .map((x) => state.toKeyword(x.k, Math.round((x.idx - 1) * 100)));
    const ok = (k: string) => !hasExcluded(k, state.scope?.excludeKeywords ?? []);
    const seasonFill = seasonalCandidates(state.scope?.mainCategory ?? query.category)
      .filter((t) => ok(t) && !dataSeasonal.some((d) => norm(d.text) === norm(t)))
      .map((t) => state.toKeyword(t));
    state.seasonal = [...dataSeasonal, ...seasonFill].slice(0, NAVER_LIST_COUNTS.seasonalKeywords);
    if (!dataSeasonal.length && !notes.some((n) => n.startsWith("시즌 키워드는"))) notes.push(`시즌 키워드는 지금 계절(${SEASON_LABEL[seasonOf()]})에 많이 찾는 키워드로 보여 줍니다.`);
    state.ideas = buildTrendIdeas(kw, state.related, state.ranked, state.seasonal, state.scope?.mainCategory ?? query.category);

    const searchTrend = (trendSeries.get(trendGroup.groupName) ?? []).map((p) => ({ date: chartLabel(p.period, timeUnit), value: Math.round(p.ratio) }));
    const keywordStats: NaverKeywordStats | null = kw
      ? {
          keyword: kw,
          monthlyPc: state.seedStats?.monthlyPc ?? null,
          monthlyMobile: state.seedStats?.monthlyMobile ?? null,
          competition: state.seedStats?.competition ?? null,
          blogDocCount: blogCount,
        }
      : null;

    const rising = state.ranked.slice(0, PAGE);
    const insight: NaverTrendInsight = {
      query,
      risingTopics: this.topicsFrom(state, rising, 0),
      risingKeywords: rising,
      seasonalKeywords: state.seasonal,
      relatedKeywords: state.related.slice(0, PAGE),
      searchTrend,
      searchTrendLabel: kw ? kw : `${scopeName} 전체`,
      contentIdeas: state.ideas.slice(0, PAGE),
      keywordStats,
      dataSource: "live",
      notes: [...notes],
      more: {
        rising: state.ranked.length > PAGE || state.computed < state.pool.length,
        related: state.related.length > PAGE,
        ideas: state.ideas.length > PAGE,
      },
      collectedAt: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), value: insight });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return insight;
  }

  /** [더보기] 10개 더. 급상승은 모자라면 그때 다음 후보 묶음을 계산한다 (데이터랩 최대 3회) */
  async getMore(query: NaverTrendQuery, section: NaverTrendSection, offset: number): Promise<NaverTrendMore> {
    let state = await this.prepare(query);
    // 다른 서버 인스턴스로 오면 기억이 없을 수 있다 → 처음 조회부터 다시 만든다
    if (state.computed === 0 || !state.ideas.length) {
      await this.getInsight(query);
      state = await this.prepare(query);
    }
    const end = offset + PAGE;
    if (section === "rising") {
      while (state.ranked.length < end && state.computed < state.pool.length) await this.rankMore(state, query.periodDays, offset);
      const list = state.ranked.slice(offset, end);
      return {
        section,
        risingKeywords: list,
        risingTopics: this.topicsFrom(state, list, offset),
        hasMore: state.ranked.length > end || state.computed < state.pool.length,
      };
    }
    if (section === "related") return { section, relatedKeywords: state.related.slice(offset, end), hasMore: state.related.length > end };
    return { section, contentIdeas: state.ideas.slice(offset, end), hasMore: state.ideas.length > end };
  }
}

/** 한 조회 조건의 중간 결과 ([더보기]가 이어서 쓴다) */
interface TrendState {
  at: number;
  kw: string;
  scope: NaverTrendQuery["profileScope"] | null;
  category?: string;
  seeds: string[];
  related: Keyword[];
  relatedRaw: string[];
  pool: string[];
  /** 급상승 계산을 마친 후보 수 */
  computed: number;
  /** 급상승 순위 (계산한 것만) */
  ranked: Keyword[];
  ideas: string[];
  seasonal: Keyword[];
  notes: string[];
  seedStats?: SearchAdKeyword;
  toKeyword: (text: string, growthRate?: number) => Keyword;
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const stateKey = (query: NaverTrendQuery, hasAd: boolean) =>
  JSON.stringify([query.keyword?.trim() ?? "", query.periodDays, query.category ?? "", query.profileScope ?? null, hasAd]);
const stateCache = new Map<string, TrendState>();
