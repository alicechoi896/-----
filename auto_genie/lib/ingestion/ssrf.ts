import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Blocks requests to localhost, private/link-local/reserved IP ranges, and
 * common cloud metadata endpoints. Resolves the hostname first so a public
 * domain that resolves to a private IP (DNS rebinding) is also rejected.
 */
export class UrlNotAllowedError extends Error {}

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIPv4(normalized.replace("::ffff:", ""));
  }
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format: fail closed
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlNotAllowedError("유효하지 않은 URL입니다.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlNotAllowedError("http 또는 https URL만 분석할 수 있습니다.");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UrlNotAllowedError("접근이 제한된 주소입니다.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UrlNotAllowedError("사설 IP 대역은 분석할 수 없습니다.");
    }
    return url;
  }

  let addresses: string[];
  try {
    const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = resolved.map((r) => r.address);
  } catch {
    throw new UrlNotAllowedError("도메인을 확인할 수 없습니다.");
  }

  if (addresses.length === 0 || addresses.some((addr) => isPrivateIp(addr))) {
    throw new UrlNotAllowedError("사설 네트워크로 연결되는 주소는 분석할 수 없습니다.");
  }

  return url;
}
