import "server-only";
import type { VideoJob } from "@/lib/types/video-production";
import type {
  ScriptFormat,
  ErrorLog,
  LearningProfile,
  ContentPublication,
  ApiConnection,
  AuditLog,
  UserSettings,
  GeneratedContent,
  PerformanceMetric,
  Product,
  ProductAnalysis,
  ProductSource,
  ReferenceVideo,
  RolePermission,
  ContentProfile,
  SavedFilter,
  SavedTrend,
  UserProfile,
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

/** 참고 영상 전용 조회 (전체를 읽지 않는다, v0.9.32) */
export interface VideoPageQuery {
  userId: string;
  /** 특정 제품 id / "none" = 제품 연결 안 된 영상 / null = 전체 */
  productId: string | null;
  limit: number;
  offset: number;
}
export interface VideoRepository extends Repository<ReferenceVideo> {
  /** 최신순 한 페이지 (Supabase: where + range) */
  listPage(q: VideoPageQuery): Promise<ReferenceVideo[]>;
  /** 이미 저장된 URL 만 (가져오기 중복 확인) */
  findUrls(userId: string, urls: string[]): Promise<string[]>;
}

export interface Repositories {
  profiles: Repository<UserProfile>;
  rolePermissions: Repository<RolePermission>;
  auditLogs: Repository<AuditLog>;
  settings: Repository<UserSettings>;
  connections: Repository<ApiConnection>;
  products: Repository<Product>;
  productSources: Repository<ProductSource>;
  productAnalyses: Repository<ProductAnalysis>;
  contents: Repository<GeneratedContent>;
  styles: Repository<UserStyle>;
  feedback: Repository<UserFeedback>;
  performance: Repository<PerformanceMetric>;
  videos: VideoRepository;
  savedFilters: Repository<SavedFilter>;
  savedTrends: Repository<SavedTrend>;
  contentProfiles: Repository<ContentProfile>;
  publications: Repository<ContentPublication>;
  learningProfiles: Repository<LearningProfile>;
  errorLogs: Repository<ErrorLog>;
  /** 대본 포맷 (v0.9.26, 본인 것만) */
  scriptFormats: Repository<ScriptFormat>;
  /** 영상 자동 제작 작업 (v0.9.51, 본인 + 관리자) */
  videoJobs: Repository<VideoJob>;
}
