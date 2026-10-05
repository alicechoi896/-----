import "server-only";
import type {
  ApiConnection,
  ApiConnectionPublic,
  ConnectionTestResult,
  ProviderCredentialMap,
  ProviderId,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { createProviderForTest, loadCredentials } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { encryptSecret, maskSecret } from "../security/crypto";

/**
 * API 연결 센터 유스케이스 (BYOK).
 * 보안 원칙
 *  - 자격증명은 서버에서 AES-256-GCM 으로 암호화해 저장한다.
 *  - 클라이언트에는 ApiConnectionPublic(마스킹 값만 포함)만 돌려준다.
 *  - 평문 Key 를 로그로 남기지 않는다.
 */

export const PROVIDER_IDS: ProviderId[] = ["openai", "claude", "youtube", "naver", "naver-searchad", "tikhub", "brightdata"];

function toPublic(c: ApiConnection): ApiConnectionPublic {
  // encryptedCredentials, userId 를 명시적으로 제거한다
  const { encryptedCredentials: _secret, userId: _user, ...rest } = c;
  void _secret;
  void _user;
  return rest;
}

function emptyConnection(provider: ProviderId): ApiConnectionPublic {
  const now = nowIso();
  return { id: `conn_${provider}`, provider, status: "disconnected", maskedHint: null, lastTest: null, createdAt: now, updatedAt: now };
}

function validate<P extends ProviderId>(provider: P, raw: unknown): ProviderCredentialMap[P] {
  const c = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string).trim() : "");
  if (provider === "naver") {
    // 비운 칸은 기존 값을 유지한다 → connect() 에서 합친다
    return { clientId: str("clientId"), clientSecret: str("clientSecret") } as ProviderCredentialMap[P];
  }
  if (provider === "naver-searchad") {
    const cred = { apiKey: str("apiKey"), secretKey: str("secretKey"), customerId: str("customerId").replace(/[^\d]/g, "") };
    if (!cred.apiKey || !cred.secretKey || !cred.customerId) {
      throw new AppError("VALIDATION", "엑세스라이선스, 비밀키, CUSTOMER_ID 세 가지를 모두 입력해 주세요.");
    }
    return cred as ProviderCredentialMap[P];
  }
  if (!str("apiKey")) throw new AppError("VALIDATION", "API Key 를 입력해 주세요.");
  if (provider === "openai" && !str("apiKey").startsWith("sk-")) {
    throw new AppError("VALIDATION", "OpenAI API Key 는 'sk-' 로 시작해야 합니다.");
  }
  if (provider === "claude" && !str("apiKey").startsWith("sk-ant-")) {
    throw new AppError("VALIDATION", "Claude API Key 는 'sk-ant-' 로 시작합니다. console.anthropic.com → API Keys 에서 확인해 주세요.");
  }
  if (provider === "youtube") {
    const key = str("apiKey");
    if (key.endsWith(".apps.googleusercontent.com") || key.startsWith("GOCSPX-")) {
      throw new AppError(
        "VALIDATION",
        "OAuth 클라이언트 ID 또는 보안 비밀번호를 입력하셨습니다. Google Cloud → 사용자 인증 정보 → '+ 사용자 인증 정보 만들기' → 'API 키'로 만든 키(AIza…)를 넣어 주세요.",
      );
    }
    if (!key.startsWith("AIza")) {
      throw new AppError("VALIDATION", "YouTube Data API 키는 보통 'AIza' 로 시작합니다. 키를 다시 확인해 주세요.");
    }
  }
  return { apiKey: str("apiKey") } as ProviderCredentialMap[P];
}

function assertProvider(provider: string): asserts provider is ProviderId {
  if (!PROVIDER_IDS.includes(provider as ProviderId)) throw new AppError("UNKNOWN_PROVIDER", "지원하지 않는 Provider 입니다.", 404);
}

/** NAVER: 비운 칸은 저장된 값으로 채운다 */
async function mergeNaver(input: ProviderCredentialMap["naver"]): Promise<ProviderCredentialMap["naver"]> {
  const prev = (await loadCredentials("naver").catch(() => null)) ?? null;
  const merged = { clientId: input.clientId || prev?.clientId || "", clientSecret: input.clientSecret || prev?.clientSecret || "" };
  if (!merged.clientId || !merged.clientSecret) throw new AppError("VALIDATION", "Client ID 와 Client Secret 을 모두 입력해 주세요.");
  return merged;
}

function hintFor(provider: ProviderId, cred: unknown): string {
  if (provider === "naver") return `ID ${maskSecret((cred as ProviderCredentialMap["naver"]).clientId)}`;
  if (provider === "naver-searchad") {
    const c = cred as ProviderCredentialMap["naver-searchad"];
    return `CUSTOMER_ID ${c.customerId} · ${maskSecret(c.apiKey)}`;
  }
  return maskSecret((cred as { apiKey: string }).apiKey);
}

/**
 * v0.9.7 이전에는 검색광고 키를 NAVER API 연결 안에 함께 저장했다.
 * 목록을 볼 때 한 번, 별도 연결(naver-searchad)로 옮기고 NAVER 연결에서는 지운다.
 */
async function migrateLegacySearchAd(): Promise<void> {
  const naver = await findConnection("naver");
  if (!naver?.encryptedCredentials || !naver.maskedHint?.includes("검색광고")) return;
  const cred = await loadCredentials("naver").catch(() => null);
  if (!cred) return;
  const repo = getRepositories();
  const now = nowIso();
  if (cred.adApiKey && cred.adSecretKey && cred.adCustomerId && !(await findConnection("naver-searchad"))) {
    const ad: ProviderCredentialMap["naver-searchad"] = { apiKey: cred.adApiKey, secretKey: cred.adSecretKey, customerId: cred.adCustomerId };
    await repo.connections.insert({
      id: createId("conn"),
      userId: naver.userId,
      provider: "naver-searchad",
      status: "connected",
      encryptedCredentials: encryptSecret(JSON.stringify(ad)),
      maskedHint: hintFor("naver-searchad", ad),
      lastTest: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const plain = { clientId: cred.clientId, clientSecret: cred.clientSecret };
  await repo.connections.update(naver.id, {
    encryptedCredentials: encryptSecret(JSON.stringify(plain)),
    maskedHint: hintFor("naver", plain),
    updatedAt: now,
  });
}

async function findConnection(provider: ProviderId) {
  const userId = await getCurrentUserId();
  const [conn] = await getRepositories().connections.list((c) => c.userId === userId && c.provider === provider);
  return conn ?? null;
}

export const connectionService = {
  async list(): Promise<ApiConnectionPublic[]> {
    await migrateLegacySearchAd().catch((e) => console.error("[connections] 검색광고 키 이전 실패", e instanceof Error ? e.message : e));
    return Promise.all(
      PROVIDER_IDS.map(async (p) => {
        const conn = await findConnection(p);
        return conn ? toPublic(conn) : emptyConnection(p);
      }),
    );
  },

  async connect(provider: string, credentials: unknown): Promise<ApiConnectionPublic> {
    assertProvider(provider);
    let cred = validate(provider, credentials);
    if (provider === "naver") cred = (await mergeNaver(cred as ProviderCredentialMap["naver"])) as typeof cred;
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const now = nowIso();
    const hint = hintFor(provider, cred);
    const encrypted = encryptSecret(JSON.stringify(cred));

    const existing = await findConnection(provider);
    if (existing) {
      const updated = await repo.connections.update(existing.id, {
        status: "connected",
        encryptedCredentials: encrypted,
        maskedHint: hint,
        lastTest: null,
        updatedAt: now,
      });
      return toPublic(updated!);
    }
    const created: ApiConnection = {
      id: createId("conn"),
      userId,
      provider,
      status: "connected",
      encryptedCredentials: encrypted,
      maskedHint: hint,
      lastTest: null,
      createdAt: now,
      updatedAt: now,
    };
    await repo.connections.insert(created);
    return toPublic(created);
  },

  async disconnect(provider: string): Promise<ApiConnectionPublic> {
    assertProvider(provider);
    const existing = await findConnection(provider);
    if (existing) await getRepositories().connections.remove(existing.id);
    return emptyConnection(provider);
  },

  async test(provider: string): Promise<ApiConnectionPublic> {
    assertProvider(provider);
    const existing = await findConnection(provider);
    if (!existing) throw new AppError("NOT_CONNECTED", "먼저 연결해 주세요.");
    const cred = await loadCredentials(provider);

    let result: ConnectionTestResult;
    const live = cred ? createProviderForTest(provider, cred) : null;
    if (live) {
      result = await live.testConnection();
    } else {
      // Mock 모드: 외부 호출 없이 저장·복호화가 정상인지만 확인한다
      result = {
        ok: Boolean(cred),
        message: cred
          ? "Mock 모드: 키 저장·암호화·복호화가 정상입니다. 실제 호출은 PROVIDER_MODE=live 에서 확인합니다."
          : "저장된 자격증명을 읽을 수 없습니다.",
        testedAt: nowIso(),
        mock: true,
      };
    }
    const updated = await getRepositories().connections.update(existing.id, {
      lastTest: result,
      status: result.ok ? "connected" : "error",
      updatedAt: nowIso(),
    });
    return toPublic(updated!);
  },
};
