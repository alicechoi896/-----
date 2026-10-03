import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * supabase/schema.sql 을 내장 Postgres(PGlite)에서 실행해 문법과 권한(RLS)을 확인한다.
 * Supabase 전용 요소(auth 스키마, auth.uid(), 역할)는 흉내 낸다.
 */
const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
const db = new PGlite();

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const PENDING = "00000000-0000-0000-0000-00000000000d";

async function as(uid: string | null) {
  await db.exec("reset role;");
  if (uid) await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
}
async function q(sql: string): Promise<{ rows: Record<string, unknown>[]; err?: string }> {
  try {
    return { rows: (await db.query(sql)).rows as Record<string, unknown>[] };
  } catch (e) {
    return { rows: [], err: e instanceof Error ? e.message : String(e) };
  }
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(schema);
  await db.exec(schema); // 여러 번 실행해도 안전해야 한다
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}','admin@x.com'), ('${B}','b@x.com'), ('${C}','c@x.com'), ('${PENDING}','p@x.com');
    update public.profiles set status='active';
    update public.profiles set role='admin' where id='${ADMIN}';
    update public.profiles set status='pending' where id='${PENDING}';
    insert into public.products (id, user_id, name, current_analysis_id) values ('prd1', '${B}', '에어팟', 'an1');
    insert into public.generated_contents (id, user_id, feature_id, channel_id, product_id, prompt_id, prompt_version, provider, model)
      values ('cnt1', '${B}', 'yt-product-video', 'youtube', 'prd1', 'p', '1', 'x', 'y');`);
});

describe("schema.sql", () => {
  it("가입하면 프로필이 승인 대기로 만들어진다 (관리자 지정 전)", async () => {
    await as(null);
    const r = await q(`select count(*)::int n from public.profiles`);
    expect(r.rows[0].n).toBe(4);
  });

  it("본인 데이터만 (own_rows): 다른 사람 콘텐츠는 안 보인다", async () => {
    await as(B);
    expect((await q(`select count(*)::int n from public.generated_contents`)).rows[0].n).toBe(1);
    await as(C);
    expect((await q(`select count(*)::int n from public.generated_contents`)).rows[0].n).toBe(0);
    await as(PENDING);
    expect((await q(`select count(*)::int n from public.products`)).rows[0].n).toBe(0);
  });

  it("본인은 등급·승인 상태를 바꿀 수 없다", async () => {
    await as(B);
    await q(`update public.profiles set role='admin', status='active' where id='${B}'`);
    await as(null);
    expect((await q(`select role from public.profiles where id='${B}'`)).rows[0].role).toBe("silver");
  });

  it("나의 스타일 제목 패턴·원하는 유형 컬럼 (기본 빈 배열·빈 객체)", async () => {
    await as(B);
    const r = await q(`insert into public.user_styles (id, name) values ('sty1','테스트') returning title_patterns, preferred_types`);
    expect(r.rows[0].title_patterns).toEqual([]);
    expect(r.rows[0].preferred_types).toEqual({});
    const u = await q(`update public.user_styles set preferred_types='{"hooks":["shock"]}' where id='sty1' returning preferred_types`);
    expect(u.rows[0].preferred_types).toEqual({ hooks: ["shock"] });
  });
});

describe("업로드 관리 (content_publications) — 팀 공용", () => {
  it("본인 이름으로만 등록, 팀원 모두 조회", async () => {
    await as(B);
    expect((await q(`insert into public.content_publications (id, user_id, content_id, platform, title, status, assignee_id) values ('pub1','${B}','cnt1','youtube','영상','published','${C}') returning id`)).rows).toHaveLength(1);
    expect((await q(`insert into public.content_publications (id, user_id, platform, title) values ('pubX','${C}','youtube','남의 이름')`)).err).toBeTruthy();
    await as(C);
    expect((await q(`select count(*)::int n from public.content_publications`)).rows[0].n).toBe(1);
  });
  it("수정: 등록자·담당자·관리자 / 삭제: 등록자·관리자", async () => {
    await as(C); // 담당자
    expect((await q(`update public.content_publications set note='담당자' where id='pub1' returning id`)).rows).toHaveLength(1);
    expect((await q(`delete from public.content_publications where id='pub1' returning id`)).rows).toHaveLength(0);
    await as(PENDING);
    expect((await q(`select count(*)::int n from public.content_publications`)).rows[0].n).toBe(0);
  });
  it("상태 값은 정해진 4가지, 플랫폼은 자유", async () => {
    await as(B);
    expect((await q(`insert into public.content_publications (id, user_id, platform, title, status) values ('bad','${B}','youtube','x','unknown')`)).err).toBeTruthy();
    expect((await q(`insert into public.content_publications (id, user_id, platform, title) values ('ig','${B}','instagram','x') returning id`)).rows).toHaveLength(1);
  });
});

describe("학습 프로필 (learning_profiles) — 팀 공통", () => {
  it("직원 누구나 만들고 고칠 수 있고, 삭제는 관리자만", async () => {
    await as(B);
    expect((await q(`insert into public.learning_profiles (id, channel_id, content_type) values ('youtube:product','youtube','product') returning id`)).rows).toHaveLength(1);
    expect((await q(`insert into public.learning_profiles (id, channel_id, content_type) values ('dup','youtube','product')`)).err).toBeTruthy();
    await as(C);
    expect((await q(`update public.learning_profiles set version=2 where id='youtube:product' returning version`)).rows[0].version).toBe(2);
    expect((await q(`delete from public.learning_profiles where id='youtube:product' returning id`)).rows).toHaveLength(0);
    await as(PENDING);
    expect((await q(`select count(*)::int n from public.learning_profiles`)).rows[0].n).toBe(0);
    await as(ADMIN);
    expect((await q(`delete from public.learning_profiles where id='youtube:product' returning id`)).rows).toHaveLength(1);
  });
});

describe("오류 기록 (error_logs) — 기록은 누구나, 전체 조회·삭제는 관리자", () => {
  it("직원은 자기 이름으로 기록 (저장 직후 결과를 돌려받을 수 있어야 한다), 남의 이름은 불가", async () => {
    await as(B);
    expect((await q(`insert into public.error_logs (id, source, message, user_id) values ('e1','client','오류','${B}') returning id`)).rows).toHaveLength(1);
    expect((await q(`insert into public.error_logs (id, source, message, user_id) values ('e2','client','오류','${C}')`)).err).toBeTruthy();
    await as(C);
    expect((await q(`insert into public.error_logs (id, source, message, user_id) values ('e3','server','C 오류','${C}') returning id`)).rows).toHaveLength(1);
    await as(B);
    expect((await q(`select id from public.error_logs`)).rows.map((r) => r.id)).toEqual(["e1"]); // 남의 기록은 안 보임
    expect((await q(`delete from public.error_logs where id='e1' returning id`)).rows).toHaveLength(0);
  });
  it("관리자는 전체 조회·삭제", async () => {
    await as(ADMIN);
    expect((await q(`select count(*)::int n from public.error_logs`)).rows[0].n).toBe(2);
    expect((await q(`delete from public.error_logs where id='e1' returning id`)).rows).toHaveLength(1);
  });
});
