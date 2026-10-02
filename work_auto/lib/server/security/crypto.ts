import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serverConfig } from "../config";

/**
 * API Key 암호화 (AES-256-GCM).
 * - 저장 형식: base64(iv).base64(authTag).base64(ciphertext)
 * - 키: ENCRYPTION_KEY 환경변수 (32바이트 base64). 운영에서는 반드시 설정한다.
 *   설정하지 않으면 개발용 고정 키를 파생한다. 이 키는 운영에서 쓰면 안 된다.
 * - 평문 Key 는 이 모듈과 Provider 생성 시점 외에는 메모리에 오래 두지 않는다.
 */

function getKey(): Buffer {
  if (serverConfig.encryptionKey) {
    const key = Buffer.from(serverConfig.encryptionKey, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY 는 32바이트 base64 여야 합니다.");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("운영 환경에서는 ENCRYPTION_KEY 를 반드시 설정해야 합니다.");
  }
  return createHash("sha256").update("content-automation-center-dev-only-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** UI 표시용 마스킹: "sk-proj-abcd...wxyz" → "sk-…wxyz" */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "••••";
  const prefix = v.startsWith("sk-") ? "sk-" : v.slice(0, 2);
  return `${prefix}…${v.slice(-4)}`;
}
