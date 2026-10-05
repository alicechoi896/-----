import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "../http";
import type { ReferenceVideo } from "@/lib/types";
import type { Repositories, Repository } from "./types";

/**
 * Supabase(Postgres) 저장소.
 *
 * - 테이블과 컬럼은 supabase/schema.sql 에 있다. 컬럼 이름은 Entity 필드의 snake_case 다.
 *   (productId → product_id, keyBenefits → key_benefits). 중첩 객체는 jsonb 컬럼에 그대로 저장한다.
 * - 로그인 사용자의 세션으로 접근하므로 RLS 가 "내 데이터만" 보이게 보장한다.
 *   user_id 컬럼은 기본값이 auth.uid() 라서, Entity 에 userId 가 없어도 자동으로 채워진다.
 * - list(filter) 는 RLS 로 걸러진 내 데이터를 가져온 뒤 함수 필터를 적용한다.
 *   데이터가 많아지면 자주 쓰는 조회를 전용 메서드(SQL where)로 승격한다 (docs/DEVELOPMENT_GUIDE.md 7장).
 */

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(item: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) if (v !== undefined) row[toSnake(k)] = v;
  return row;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const item: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) item[toCamel(k)] = v;
  return item as T;
}

function fail(table: string, action: string, error: { message: string; code?: string }): never {
  console.error(`[supabase] ${table}.${action}`, error.code, error.message);
  if (error.code === "42501") throw new AppError("FORBIDDEN", "이 작업을 할 권한이 없습니다.", 403);
  // 새 테이블을 아직 만들지 않았을 때 (schema.sql 재실행 전)
  if (error.code === "PGRST205" || error.code === "42P01") {
    throw new AppError("SCHEMA_OUTDATED", "DB 업데이트가 필요합니다. Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행해 주세요.", 409);
  }
  throw new AppError("DB_ERROR", "데이터베이스 처리 중 오류가 발생했습니다.", 500);
}

/**
 * 새로 추가했지만 아직 Supabase 에 schema.sql 을 다시 실행하지 않았을 수 있는 컬럼.
 * 컬럼이 없으면(PGRST204) 값이 비어 있을 때만 빼고 다시 저장한다. 값이 있으면 조용히 버리지 않고 안내한다.
 */
const PENDING_COLUMNS: Record<string, string[]> = {
  user_styles: ["title_patterns", "preferred_types", "product_format_id", "info_format_id"], // v0.9.9, v0.9.23, v0.9.27
  script_formats: ["hooks", "ctas", "title_patterns", "preferred_types", "bad_examples"], // v0.9.37
  content_profiles: ["audience"], // v0.9.37
};

async function writeWithPendingColumns<R>(
  table: string,
  row: Record<string, unknown>,
  run: (row: Record<string, unknown>) => PromiseLike<{ data: R; error: { message: string; code?: string } | null }>,
): Promise<{ data: R; error: { message: string; code?: string } | null }> {
  // 아직 없는 새 컬럼이 여러 개일 수 있다 → 빈 값이면 하나씩 빼고 다시 (최대 컬럼 수만큼)
  let current = row;
  for (let i = 0; i <= (PENDING_COLUMNS[table] ?? []).length; i++) {
    const res = await run(current);
    const missing = res.error?.code === "PGRST204" ? (PENDING_COLUMNS[table] ?? []).find((c) => res.error!.message.includes(`'${c}'`)) : undefined;
    if (!missing || !(missing in current)) return res;
    const value = current[missing];
    const empty = value == null || value === "" || (Array.isArray(value) ? value.length === 0 : typeof value === "object" && Object.keys(value).length === 0);
    if (!empty) {
      throw new AppError("SCHEMA_OUTDATED", "DB 업데이트가 필요합니다. Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행한 뒤 저장해 주세요.", 409);
    }
    console.warn(`[supabase] ${table}.${missing} 컬럼이 아직 없습니다 (schema.sql 재실행 필요). 빈 값이라 빼고 저장합니다.`);
    const { [missing]: _drop, ...rest } = current;
    void _drop;
    current = rest;
  }
  return run(current);
}

function createTable<T extends { id: string }>(table: string): Repository<T> {
  return {
    async list(filter) {
      const db = await createSupabaseServerClient();
      const { data, error } = await db.from(table).select("*").order("created_at", { ascending: false, nullsFirst: false });
      if (error) fail(table, "list", error);
      const rows = (data ?? []).map((r) => fromRow<T>(r));
      return filter ? rows.filter(filter) : rows;
    },
    async get(id) {
      const db = await createSupabaseServerClient();
      const { data, error } = await db.from(table).select("*").eq("id", id).maybeSingle();
      if (error) fail(table, "get", error);
      return data ? fromRow<T>(data) : null;
    },
    async insert(item) {
      const db = await createSupabaseServerClient();
      const { data, error } = await writeWithPendingColumns(table, toRow(item) as Record<string, unknown>, (row) =>
        db.from(table).insert(row).select("*").single(),
      );
      if (error) fail(table, "insert", error);
      return fromRow<T>(data);
    },
    async update(id, patch) {
      const db = await createSupabaseServerClient();
      const { data, error } = await writeWithPendingColumns(table, toRow(patch) as Record<string, unknown>, (row) =>
        db.from(table).update(row).eq("id", id).select("*").maybeSingle(),
      );
      if (error) fail(table, "update", error);
      return data ? fromRow<T>(data) : null;
    },
    async remove(id) {
      const db = await createSupabaseServerClient();
      const { error, count } = await db.from(table).delete({ count: "exact" }).eq("id", id);
      if (error) fail(table, "remove", error);
      return (count ?? 0) > 0;
    },
  };
}

export const supabaseRepositories: Repositories = {
  profiles: createTable("profiles"),
  rolePermissions: createTable("role_permissions"),
  auditLogs: createTable("audit_logs"),
  settings: createTable("user_settings"),
  connections: createTable("api_connections"),
  products: createTable("products"),
  productSources: createTable("product_sources"),
  productAnalyses: createTable("product_analyses"),
  contents: createTable("generated_contents"),
  styles: createTable("user_styles"),
  feedback: createTable("user_feedback"),
  performance: createTable("performance_metrics"),
  videos: {
    ...createTable<ReferenceVideo>("reference_videos"),
    async listPage({ userId, productId, limit, offset }) {
      const db = await createSupabaseServerClient();
      let q = db.from("reference_videos").select("*").eq("user_id", userId);
      if (productId === "none") q = q.is("product_id", null);
      else if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error) fail("reference_videos", "listPage", error);
      return (data ?? []).map((r) => fromRow<ReferenceVideo>(r));
    },
    async findUrls(userId, urls) {
      if (!urls.length) return [];
      const db = await createSupabaseServerClient();
      const { data, error } = await db.from("reference_videos").select("url").eq("user_id", userId).in("url", urls);
      if (error) fail("reference_videos", "findUrls", error);
      return (data ?? []).map((r) => String((r as { url: string }).url));
    },
  },
  savedFilters: createTable("saved_filters"),
  savedTrends: createTable("saved_trends"),
  contentProfiles: createTable("content_profiles"),
  publications: createTable("content_publications"),
  learningProfiles: createTable("learning_profiles"),
  errorLogs: createTable("error_logs"),
  scriptFormats: createTable("script_formats"),
};
