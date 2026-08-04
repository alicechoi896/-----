import { describe, expect, it, vi, beforeEach } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns", () => ({
  promises: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

const { isPrivateIp, assertPublicUrl, UrlNotAllowedError } = await import("@/lib/ingestion/ssrf");

describe("isPrivateIp", () => {
  it("flags common private/reserved IPv4 ranges", () => {
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true); // cloud metadata endpoint
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });

  it("flags IPv6 loopback and link-local", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("rejects invalid URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects localhost by hostname", async () => {
    await expect(assertPublicUrl("http://localhost:3000/admin")).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects a literal private IP without needing DNS", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(
      UrlNotAllowedError
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a public-looking hostname that resolves to a private IP (DNS rebinding)", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicUrl("http://rebind.example.com/")).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("allows a hostname that resolves to a public IP", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const url = await assertPublicUrl("https://example.com/article");
    expect(url.hostname).toBe("example.com");
  });
});
