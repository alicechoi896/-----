import { STYLE_IMPORT_FIELD, STYLE_IMPORT_KINDS, type StyleImportKind } from "./style-limits";

/**
 * 나의 스타일 → CSV (type,text). [파일로 일괄 추가]에 그대로 다시 올릴 수 있는 형식이다.
 * - UTF-8 BOM + CRLF: 엑셀에서 한글이 깨지지 않게
 * - 수식 주입 방지: =, +, -, @ 로 시작하는 값은 앞에 ' 를 붙인다 (올릴 때 서버가 다시 뗀다)
 */
export type StyleCsvLists = Record<(typeof STYLE_IMPORT_FIELD)[StyleImportKind], string[]>;

const FORMULA_START = /^[=+\-@]/;

export function escapeCsvCell(value: string): string {
  const v = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export function styleToCsv(lists: StyleCsvLists): string {
  const rows = ["type,text"];
  for (const kind of STYLE_IMPORT_KINDS) {
    for (const text of lists[STYLE_IMPORT_FIELD[kind]] ?? []) rows.push(`${kind},${escapeCsvCell(text)}`);
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
export function styleCsvFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "").trim().slice(0, 40) || "style";
  return `${base}-스타일.csv`;
}

/** 브라우저에서 CSV 파일로 내려받는다 (서버를 거치지 않는다) */
export function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function countStyleItems(lists: StyleCsvLists): number {
  return STYLE_IMPORT_KINDS.reduce((n, k) => n + (lists[STYLE_IMPORT_FIELD[k]]?.length ?? 0), 0);
}
