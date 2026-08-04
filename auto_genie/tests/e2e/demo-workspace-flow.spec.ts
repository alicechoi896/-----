import { test, expect } from "@playwright/test";

/**
 * End-to-end walk-through of the core product loop against a live dev server
 * with a configured Supabase project + seeded demo workspace (`pnpm seed`).
 * Requires OPENAI_API_KEY to be set for the AI-driven steps (analysis,
 * strategy generation, content generation) to actually complete rather than
 * fail with a real provider error — that failure mode is expected and
 * correct behavior when no key is configured, not a bug to work around.
 */

test.describe("demo workspace core flow", () => {
  test("login -> demo workspace -> register data -> generate strategy -> generate content -> register performance", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "개발용 데모 로그인" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("AI 컨트롤타워")).toBeVisible();

    // 데이터 등록 -----------------------------------------------------------
    await page.goto("/learning");
    await page.getByRole("tab", { name: "텍스트 직접 입력" }).click();
    await page.getByLabel("제목").fill("E2E 테스트 자료");
    await page.getByLabel("본문").fill(
      "온라인 판매자를 위한 콘텐츠 자동화 교육 상품입니다. 조회수는 높지만 상담 문의로 이어지지 않는 문제를 자주 겪습니다. ".repeat(
        10
      )
    );
    await page.getByRole("button", { name: "자료 등록" }).click();
    await expect(page.getByText("AI 분석을 시작하시겠습니까?")).toBeVisible();
    await page.getByRole("button", { name: "AI 분석 시작" }).click();
    await expect(page.getByText(/완료|실패/)).toBeVisible({ timeout: 60_000 });

    // 전략 생성 --------------------------------------------------------------
    await page.goto("/strategy");
    await page.getByRole("button", { name: "새 전략 분석" }).click();
    await page.getByLabel("캠페인명").fill("E2E 테스트 캠페인");
    await page.getByLabel("고객").fill("온라인 판매를 시작한 1인 사업자");
    await page.getByLabel("현재 문제").fill("조회수는 나오는데 상담 문의로 이어지지 않는다");
    await page.getByLabel("네이버 블로그").check();
    await page.getByRole("button", { name: "AI 전략 생성 시작" }).click();
    await expect(page.getByText("점수 비교")).toBeVisible({ timeout: 60_000 });

    // 전략 선택 --------------------------------------------------------------
    await page.getByRole("button", { name: "이 전략 선택" }).first().click();
    await page.getByRole("button", { name: /선택 확정하고 콘텐츠 제작으로 이동/ }).click();

    // 콘텐츠 생성 ------------------------------------------------------------
    await expect(page).toHaveURL(/\/orchestrator/);
    await page.getByRole("button", { name: "콘텐츠 생성" }).click();
    await expect(page.getByText("네이버 블로그")).toBeVisible({ timeout: 60_000 });

    // 성과 등록 --------------------------------------------------------------
    await page.getByRole("button", { name: "성과 등록" }).first().click();
    await expect(page).toHaveURL(/\/performance/);
    await page.getByLabel("조회").fill("500");
    await page.getByLabel("문의").fill("5");
    await page.getByRole("button", { name: "성과 등록" }).click();
    await expect(page.getByText(/성과 점수/)).toBeVisible({ timeout: 30_000 });
  });
});
