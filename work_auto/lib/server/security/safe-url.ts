import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 사용자가 넣은 주소로 서버가 접속할 때의 안전 검사 (SSRF 방지).
 * 서버 내부(localhost), 사설망(10.x, 192.168.x), 클라우드 내부 주소(169.254.169.254) 등으로
 * 서버가 대신 접속하게 만드는 공격을 막는다. 리다이렉트도 한 번씩 다시 검사한다.
 */

const BLOCKED_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 링크 로컬·클라우드 메타데이터
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // 멀티캐스트·예약
  );
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const v6 = ip.toLowerCase();
  // IPv4 를 담은 IPv6 (::ffff:127.0.0.1 → URL 이 ::ffff:7f00:1 로 바꿔 쓴다)
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateV4(mapped);
  const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (v6.startsWith("::ffff:") || v6.startsWith("64:ff9b:")) return true; // 그 밖의 변환 주소는 막는다
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** http(s) 이고, 공개 인터넷 주소로만 연결되는지 확인한다. 아니면 Error */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http(s) 주소만 쓸 수 있습니다.");
  if (url.username || url.password) throw new Error("계정 정보가 들어간 주소는 쓸 수 없습니다.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOST.test(host)) throw new Error("내부 주소는 쓸 수 없습니다.");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateIp)) throw new Error("내부 주소는 쓸 수 없습니다.");
  return url;
}

/** fetch 와 같지만, 처음 주소와 리다이렉트되는 모든 주소를 assertPublicUrl 로 검사한다 */
export async function safeFetch(raw: string | URL, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let i = 0; ; i++) {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    if (i >= maxRedirects) throw new Error("리다이렉트가 너무 많습니다.");
    url = await assertPublicUrl(new URL(location, url));
  }
}
