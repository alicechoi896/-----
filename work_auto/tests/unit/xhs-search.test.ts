import { describe, expect, it } from "vitest";
import { parseCount, parseNote, parseSearchResponse } from "@/lib/server/providers/xiaohongshu/parse";

const ID = "697c0eee000000000a03c308";

describe("샤오홍슈 검색 응답 읽기 (TikHub, 응답 구조가 문서에 없어 너그럽게)", () => {
  it("숫자: 1.2万 · 3w · 12,345 · 숫자", () => {
    expect(parseCount("1.2万")).toBe(12_000);
    expect(parseCount("3w")).toBe(30_000);
    expect(parseCount("12,345")).toBe(12_345);
    expect(parseCount(87)).toBe(87);
    expect(parseCount("많음")).toBeNull();
  });

  it("items[].note 모양: 영상만, 원본 URL 에 xsec_token, 없는 값은 null", () => {
    const body = {
      code: 200,
      data: {
        data: {
          search_id: "s1",
          items: [
            {
              model_type: "note",
              note: {
                id: ID,
                type: "video",
                xsec_token: "AB12",
                display_title: "无线吸尘器测评",
                user: { nickname: "小红薯" },
                liked_count: "1.2万",
                comments_count: 34,
                timestamp: 1791000000,
                video_info_v2: { capa: { duration: 42 } },
                images_list: [{ url: "http://sns-img.xhscdn.com/a.jpg" }],
              },
            },
            { model_type: "note", note: { id: "697c0eee000000000a03c309", type: "normal", display_title: "이미지 노트" } },
            { model_type: "hot_query", queries: [] },
          ],
        },
      },
    };
    const r = parseSearchResponse(body);
    expect(r.notes).toHaveLength(1);
    const n = r.notes[0];
    expect(n).toMatchObject({ noteId: ID, title: "无线吸尘器测评", author: "小红薯", likes: 12_000, comments: 34, collects: null, durationSec: 42 });
    expect(n.url).toBe(`https://www.xiaohongshu.com/discovery/item/${ID}?xsec_token=AB12&xsec_source=app_share`);
    expect(n.coverUrl).toBe("https://sns-img.xhscdn.com/a.jpg");
    expect(n.publishedAt).toBe(new Date(1791000000 * 1000).toISOString());
    expect(r.searchId).toBe("s1");
    expect(r.rawCount).toBe(3);
  });

  it("다른 위치(깊은 배열)·note_card·밀리초 시간도 읽는다", () => {
    const body = { data: { result: { list: [{ note_card: { note_id: ID, type: "video", title: "제목", interact_info: { liked_count: "5", collected_count: "2" }, time: 1791000000000 } }] } } };
    const r = parseSearchResponse(body);
    expect(r.notes[0]).toMatchObject({ noteId: ID, likes: 5, collects: 2, publishedAt: new Date(1791000000000).toISOString() });
  });

  it("노트 ID 가 아니면 버린다", () => {
    expect(parseNote({ note: { id: "abc", type: "video" } })).toBeNull();
  });
});
