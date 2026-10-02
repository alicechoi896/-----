import "server-only";
import type {
  ApiConnection,
  GeneratedContent,
  PerformanceMetric,
  Product,
  ProductAnalysis,
  ProductSource,
  ReferenceVideo,
  User,
  UserFeedback,
  UserStyle,
} from "@/lib/types";

/**
 * 저장소 인터페이스.
 * Service 는 이 인터페이스에만 의존한다. 구현체(인메모리 → Supabase)를 바꿔도 Service 코드는 그대로다.
 *
 * V1 은 단순한 범용 CRUD + 조건 함수 필터를 쓴다.
 * DB 구현으로 바꿀 때 조건 함수 필터는 SQL 로 옮길 수 없으므로,
 * 자주 쓰는 조회는 전용 메서드(예: contents.listExemplars(featureId))로 승격한다. (docs/DEVELOPMENT_GUIDE.md)
 */
export interface Repository<T extends { id: string }> {
  list(filter?: (item: T) => boolean): Promise<T[]>;
  get(id: string): Promise<T | null>;
  insert(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  remove(id: string): Promise<boolean>;
}

export interface Repositories {
  users: Repository<User>;
  connections: Repository<ApiConnection>;
  products: Repository<Product>;
  productSources: Repository<ProductSource>;
  productAnalyses: Repository<ProductAnalysis>;
  contents: Repository<GeneratedContent>;
  styles: Repository<UserStyle>;
  feedback: Repository<UserFeedback>;
  performance: Repository<PerformanceMetric>;
  videos: Repository<ReferenceVideo>;
}
