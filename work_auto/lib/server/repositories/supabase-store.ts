import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "../http";
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
  throw new AppError("DB_ERROR", "데이터베이스 처리 중 오류가 발생했습니다.", 500);
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
      const { data, error } = await db.from(table).insert(toRow(item)).select("*").single();
      if (error) fail(table, "insert", error);
      return fromRow<T>(data);
    },
    async update(id, patch) {
      const db = await createSupabaseServerClient();
      const { data, error } = await db.from(table).update(toRow(patch)).eq("id", id).select("*").maybeSingle();
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
  videos: createTable("reference_videos"),
  savedFilters: createTable("saved_filters"),
  savedTrends: createTable("saved_trends"),
  contentProfiles: createTable("content_profiles"),
};
