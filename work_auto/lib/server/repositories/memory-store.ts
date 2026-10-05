import "server-only";
import { createSeedState, type StoreState } from "@/lib/mock/seed";
import type { Repositories, Repository } from "./types";

/**
 * 인메모리 저장소 (V1).
 * - globalThis 에 두어 개발 서버의 HMR(모듈 재로딩) 후에도 데이터가 유지되게 한다.
 * - 서버 프로세스를 재시작하면 Seed 상태로 돌아간다.
 */

const globalForStore = globalThis as unknown as { __contentCenterStore?: StoreState };

function getState(): StoreState {
  if (!globalForStore.__contentCenterStore) {
    globalForStore.__contentCenterStore = createSeedState();
  }
  return globalForStore.__contentCenterStore;
}

function createCollection<K extends keyof StoreState>(key: K): Repository<StoreState[K][number]> {
  type T = StoreState[K][number];
  const rows = () => getState()[key] as T[];
  // 호출자가 반환값을 수정해도 저장소가 바뀌지 않도록 복사본을 돌려준다 (DB 와 같은 동작)
  const clone = <V>(v: V): V => structuredClone(v);

  return {
    async list(filter) {
      return clone(filter ? rows().filter(filter) : rows());
    },
    async get(id) {
      const found = rows().find((r) => r.id === id);
      return found ? clone(found) : null;
    },
    async insert(item) {
      rows().unshift(clone(item));
      return clone(item);
    },
    async update(id, patch) {
      const list = rows();
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) return null;
      list[index] = { ...list[index], ...clone(patch) };
      return clone(list[index]);
    },
    async remove(id) {
      const list = rows();
      const index = list.findIndex((r) => r.id === id);
      if (index < 0) return false;
      list.splice(index, 1);
      return true;
    },
  };
}

export const memoryRepositories: Repositories = {
  profiles: createCollection("profiles"),
  rolePermissions: createCollection("rolePermissions"),
  auditLogs: createCollection("auditLogs"),
  settings: createCollection("settings"),
  connections: createCollection("connections"),
  products: createCollection("products"),
  productSources: createCollection("productSources"),
  productAnalyses: createCollection("productAnalyses"),
  contents: createCollection("contents"),
  styles: createCollection("styles"),
  feedback: createCollection("feedback"),
  performance: createCollection("performance"),
  videos: {
    ...createCollection("videos"),
    async listPage({ userId, productId, limit, offset }) {
      const rows = getState()
        .videos.filter((v) => v.userId === userId && (productId == null || (productId === "none" ? !v.productId : v.productId === productId)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return structuredClone(rows.slice(offset, offset + limit));
    },
    async findUrls(userId, urls) {
      const want = new Set(urls);
      return getState().videos.filter((v) => v.userId === userId && want.has(v.url)).map((v) => v.url);
    },
  },
  savedFilters: createCollection("savedFilters"),
  savedTrends: createCollection("savedTrends"),
  contentProfiles: createCollection("contentProfiles"),
  publications: createCollection("publications"),
  learningProfiles: createCollection("learningProfiles"),
  errorLogs: createCollection("errorLogs"),
  scriptFormats: createCollection("scriptFormats"),
};
