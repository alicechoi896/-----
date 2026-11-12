import { describe, expect, it } from "vitest";
import { FEATURES, STANDALONE_PAGES } from "@/lib/registry";
import { MENU, menuItemOf } from "@/lib/registry/menu";

/** v0.9.197 메뉴 정리: 기능이 메뉴에서 사라지지 않게 — 모든 기능·단독 페이지가 메뉴(또는 탭)에 있어야 한다 */
describe("왼쪽 메뉴 6묶음", () => {
  it("관리자 기능을 빼고 모든 기능이 메뉴나 탭에 있다 (릴스 읽기처럼 다른 화면의 탭에 있는 것은 menuParent 로)", () => {
    const missing = FEATURES.filter((f) => f.channelId !== "admin" && !menuItemOf(f.id) && !(f.menuParent && menuItemOf(f.menuParent))).map((f) => f.id);
    expect(missing).toEqual([]);
  });
  it("모든 단독 페이지가 메뉴에 있다", () => {
    expect(STANDALONE_PAGES.filter((p) => !menuItemOf(p.id)).map((p) => p.id)).toEqual([]);
  });
  it("메뉴의 모든 탭이 실제 기능·페이지다 (없는 id 없음), 한 기능은 한 메뉴에만", () => {
    const ids = MENU.flatMap((g) => g.items.flatMap((i) => i.tabs.map((t) => t.id)));
    const known = new Set([...FEATURES.map((f) => f.id), ...STANDALONE_PAGES.map((p) => p.id)]);
    expect(ids.filter((id) => !known.has(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
