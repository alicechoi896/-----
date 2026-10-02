import "server-only";
import { categorySeedKeywords } from "@/lib/mock/naver-trends";
import { hasExcluded } from "@/lib/types/profile";
import type { Keyword, NaverKeywordStats, NaverRisingTopic, NaverTrendInsight, NaverTrendQuery } from "@/lib/types";
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
 *     - 시즌: 작년 다음 달 지수 ÷ 연평균 (다음 달에 오를 키워드)
 *  4) 블로그 검색 API: 검색어의 블로그 누적 문서 수 (발행량 지표)
 *  5) 글감 아이디어: 위 키워드로 규칙 기반 생성 (AI 호출 없음, 비용 0)
 *  제외 키워드가 들어간 키워드는 모든 목록에서 뺀다.
 *
 * 호출량: 조회 1회 ≈ 데이터랩 최대 9회 + 검색광고 1~2회 + 블로그 검색 1회. 같은 조건은 6시간 캐시.
 * (데이터랩 하루 1,000회, 검색 API 하루 25,000회)
 */

const DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";
const BLOG_URL = "https://openapi.naver.com/v1/search/blog.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CANDIDATES = 20;

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

  /** 키워드 여러 개를 각각 한 그룹으로 (5개씩, 동시에 2번까지만 호출 — 한꺼번에 보내면 한도에 걸릴 수 있다) */
  private async seriesFor(keywords: string[], days: number, timeUnit: "date" | "week" | "month"): Promise<Map<string, Series>> {
    const chunks: string[][] = [];
    for (let i = 0; i < keywords.length; i += 5) chunks.push(keywords.slice(i, i + 5));
    const out = new Map<string, Series>();
    for (let i = 0; i < chunks.length; i += 2) {
      const maps = await Promise.all(
        chunks.slice(i, i + 2).map((c) => this.datalab(c.map((k) => ({ groupName: k, keywords: [k] })), days, timeUnit)),
      );
      for (const m of maps) for (const [k, v] of m) out.set(k, v);
    }
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
   * 부분 실패에 강하게: 각 단계가 실패해도 나머지는 보여주고, 이유는 notes 에 남긴다.
   * (예전에는 한 단계가 비거나 실패하면 화면 전체가 비었다)
   */
  async getInsight(query: NaverTrendQuery): Promise<NaverTrendInsight> {
    const kw = query.keyword?.trim() ?? "";
    const scope = query.profileScope ?? null;
    const exclude = scope?.excludeKeywords ?? [];
    const cacheKey = JSON.stringify([kw, query.periodDays, query.category ?? "", scope, Boolean(this.searchAd)]);
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value, query };

    const notes: string[] = [];
    const ok = (k: string) => !hasExcluded(k, exclude);
    const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const scopeName = scope?.profileName ?? query.category ?? "카테고리";

    // 1) 조사 출발점: 검색어 → 프로필 관심 키워드·세부 관심분야 → 카테고리 기본 키워드
    const seeds = uniq(
      kw ? [kw] : scope ? [...scope.seedKeywords, ...scope.subCategories] : categorySeedKeywords(query.category ?? ""),
    ).filter(ok);
    if (!seeds.length) seeds.push(scope?.mainCategory ?? "가전");

    // 2) 연관 키워드 + 검색량: 검색광고 API → 없거나 실패하면 네이버 자동완성
    let related: SearchAdKeyword[] = [];
    let seedStats: SearchAdKeyword | undefined;
    let relatedFromAd = false;
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
          : "검색광고 API 키가 없어 관련 키워드는 네이버 자동완성으로 보여주고, 월간 검색량은 표시하지 않습니다. (설정 → API 연결 센터 → NAVER 에 검색광고 키 3개 입력)",
      );
    }
    const volumeOf = new Map(related.filter((r) => r.volume).map((r) => [r.text, r]));

    // 3) 급상승 후보 = 출발점 + 연관 키워드
    const candidates = uniq([...seeds, ...related.slice(0, 30).map((r) => r.text)]).slice(0, MAX_CANDIDATES);
    const periodDays = query.periodDays;
    const timeUnit = periodDays <= 90 ? "date" : periodDays <= 365 ? "week" : "month";
    const fail = (what: string) => (e: unknown) => {
      notes.push(`${what}: ${e instanceof NaverHttpError ? e.message : "데이터랩 응답 오류"}`);
      return new Map<string, Series>();
    };

    // 차례로 호출 (한꺼번에 많이 보내지 않는다)
    const candidateSeries = await this.seriesFor(candidates, Math.min(periodDays, 90), "date").catch(fail("급상승 키워드"));
    const monthly = await this.seriesFor(candidates, 365, "month").catch(fail("시즌 키워드"));
    // 검색 추이: 검색어가 있으면 그 검색어, 없으면 출발점 키워드를 한 묶음으로 (프로필·카테고리 전체 관심도)
    const trendGroup = kw ? { groupName: kw, keywords: [kw] } : { groupName: scopeName, keywords: seeds.slice(0, 20) };
    const trendSeries = await this.datalab([trendGroup], periodDays, timeUnit).catch(fail("검색 추이"));
    const blogCount = kw
      ? await this.blogDocCount(kw).catch((e: unknown) => {
          notes.push(e instanceof NaverHttpError ? `블로그 문서 수: ${e.message}` : "블로그 문서 수를 가져오지 못했습니다.");
          return null;
        })
      : null;

    const withData = candidates.filter((k) => (candidateSeries.get(k) ?? []).some((p) => p.ratio > 0));
    if (candidateSeries.size > 0 && withData.length === 0) {
      notes.push(`데이터랩에서 후보 키워드 ${candidates.length}개의 검색 데이터를 받지 못했습니다. 검색량이 적은 키워드일 수 있으니 프로필의 관심 키워드를 사람들이 실제로 검색하는 말로 바꿔 보세요.`);
    }

    const toKeyword = (text: string, growthRate?: number): Keyword => {
      const v = volumeOf.get(text) ?? (seedStats && text === kw ? seedStats : undefined);
      return { text, source: "naver", volume: v?.volume, growthRate, competition: v?.competition };
    };

    const risingKeywords = withData
      .map((k) => ({ k, g: growthOf(candidateSeries.get(k) ?? []) }))
      .sort((a, b) => b.g - a.g)
      .slice(0, 8)
      .map((x) => toKeyword(x.k, x.g));

    // 시즌: 작년 "다음 달" 지수가 연평균보다 높은 키워드
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const lastYearNext = `${nextMonth.getFullYear() - 1}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    const seasonalKeywords = candidates
      .map((k) => {
        const s = monthly.get(k) ?? [];
        const base = avg(s.map((p) => p.ratio));
        const target = s.find((p) => p.period.startsWith(lastYearNext))?.ratio ?? 0;
        return { k, idx: base > 0 ? target / base : 0 };
      })
      .filter((x) => x.idx >= 1.15)
      .sort((a, b) => b.idx - a.idx)
      .slice(0, 6)
      .map((x) => toKeyword(x.k, Math.round((x.idx - 1) * 100)));
    if (monthly.size > 0 && !seasonalKeywords.length) notes.push("다음 달에 오를 시즌 키워드가 후보 중에 없습니다 (작년 같은 시기 기준).");

    const relatedKeywords = related.slice(0, 15).map((r) => toKeyword(r.text));
    const searchTrend = (trendSeries.get(trendGroup.groupName) ?? []).map((p) => ({ date: chartLabel(p.period, timeUnit), value: Math.round(p.ratio) }));

    const keywordStats: NaverKeywordStats | null = kw
      ? {
          keyword: kw,
          monthlyPc: seedStats?.monthlyPc ?? null,
          monthlyMobile: seedStats?.monthlyMobile ?? null,
          competition: seedStats?.competition ?? null,
          blogDocCount: blogCount,
        }
      : null;

    const now = new Date().toISOString();
    const risingTopics: NaverRisingTopic[] = risingKeywords.slice(0, 5).map((k, i) => ({
      id: `nv_${seededNumber(k.text, 100000, 999999)}`,
      source: "naver",
      title: k.text,
      description: `최근 검색 지수가 앞선 기간보다 ${k.growthRate ?? 0}% ${(k.growthRate ?? 0) >= 0 ? "높습니다" : "낮습니다"}.${k.volume ? ` 월간 검색량 약 ${k.volume.toLocaleString("ko-KR")}회.` : ""}`,
      category: scope?.mainCategory ?? query.category ?? "",
      keywords: [k.text, ...related.filter((r) => r.text.includes(k.text) && r.text !== k.text).slice(0, 3).map((r) => r.text)],
      growthRate: k.growthRate ?? 0,
      trendScore: Math.max(30, 95 - i * 8),
      collectedAt: now,
    }));

    const insight: NaverTrendInsight = {
      query,
      risingTopics,
      risingKeywords,
      seasonalKeywords,
      relatedKeywords,
      searchTrend,
      searchTrendLabel: kw ? kw : `${scopeName} 전체`,
      contentIdeas: buildIdeas(kw, relatedKeywords, risingKeywords, seasonalKeywords, scope?.mainCategory ?? query.category),
      keywordStats,
      dataSource: "live",
      notes,
      collectedAt: now,
    };
    cache.set(cacheKey, { at: Date.now(), value: insight });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return insight;
  }
}

/** 글감 아이디어 (규칙 기반, AI 호출 없음) */
function buildIdeas(kw: string, related: Keyword[], rising: Keyword[], seasonal: Keyword[], category?: string): string[] {
  const r = related.map((k) => k.text);
  const ideas = kw
    ? [
        `${kw} 고르는 기준 5가지`,
        `${kw} 가격대별 비교 정리`,
        r[0] && r[1] ? `${r[0]} vs ${r[1]} 차이 한눈에 보기` : "",
        `${kw} 장단점 솔직 정리`,
        r[2] ? `${r[2]}, 사기 전에 확인할 것` : "",
      ]
    : [
        rising[0] ? `요즘 '${rising[0].text}' 검색이 늘어난 이유` : "",
        rising[1] ? `${rising[1].text} 처음 사는 사람을 위한 가이드` : "",
        seasonal[0] ? `다음 달 대비: ${seasonal[0].text} 미리 준비하기` : "",
        category ? `${category} 입문자가 많이 묻는 질문 정리` : "",
        rising[2] ? `${rising[2].text} 가격대별 추천` : "",
      ];
  return ideas.filter(Boolean).slice(0, 5);
}
