import "server-only";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import DOMPurify from "isomorphic-dompurify";
import { assertPublicUrl } from "./ssrf";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_REDIRECTS = 5;

export class UrlAnalysisError extends Error {}

async function fetchWithLimits(startUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const validated = await assertPublicUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(validated, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "jini-ai-marketing-brain/1.0 (+content analyzer)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new UrlAnalysisError("요청 시간이 초과되었습니다.");
      }
      throw new UrlAnalysisError("URL에 접근할 수 없습니다.");
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UrlAnalysisError("리디렉션 대상을 확인할 수 없습니다.");
      }
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new UrlAnalysisError("로그인이 필요하거나 접근이 제한된 페이지는 지원하지 않습니다.");
    }

    if (!response.ok) {
      throw new UrlAnalysisError(`페이지를 불러오지 못했습니다 (HTTP ${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      throw new UrlAnalysisError("HTML 페이지만 분석할 수 있습니다.");
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new UrlAnalysisError("응답 크기가 너무 큽니다 (최대 8MB).");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new UrlAnalysisError("페이지 응답을 읽을 수 없습니다.");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new UrlAnalysisError("응답 크기가 너무 큽니다 (최대 8MB).");
      }
      chunks.push(value);
    }

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { html, finalUrl: validated.toString() };
  }

  throw new UrlAnalysisError("리디렉션이 너무 많습니다.");
}

export interface ExtractedUrlContent {
  title: string;
  textContent: string;
  excerpt: string;
  finalUrl: string;
}

/** Fetches a public URL and extracts its main article content, server-side only. */
export async function fetchAndExtractUrl(url: string): Promise<ExtractedUrlContent> {
  const { html, finalUrl } = await fetchWithLimits(url);

  const dom = new JSDOM(html, { url: finalUrl });
  const article = new Readability(dom.window.document).parse();

  if (!article || !article.textContent || article.textContent.trim().length < 50) {
    throw new UrlAnalysisError("페이지에서 본문을 추출할 수 없습니다.");
  }

  // Readability already returns plain text, but strip any residual markup as
  // defense-in-depth before this text is ever stored or shown in the UI.
  const cleanTextContent = DOMPurify.sanitize(article.textContent.trim(), { ALLOWED_TAGS: [] });
  const cleanTitle = DOMPurify.sanitize((article.title || finalUrl).trim(), { ALLOWED_TAGS: [] });

  return {
    title: cleanTitle,
    textContent: cleanTextContent,
    excerpt: article.excerpt ?? "",
    finalUrl,
  };
}
