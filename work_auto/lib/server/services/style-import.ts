import "server-only";
import {
  STYLE_IMPORT_KINDS,
  STYLE_IMPORT_MAX_BYTES,
  STYLE_IMPORT_MAX_ITEMS,
  STYLE_IMPORT_MAX_LEN,
  cleanStyleText,
  styleItemKey,
  type StyleImportKind,
} from "@/lib/style-limits";
import type { StyleImportPreview } from "@/lib/types";
import { AppError } from "../http";

/**
 * 나의 스타일 파일 일괄 추가 (.txt / .csv) — 미리보기용 파싱만 한다. 저장은 하지 않는다.
 *
 * 보안 (docs/STYLE_CONTEXT.md)
 *  - 파일은 요청 메모리 안에서만 읽는다. 디스크·public 경로·DB 에 파일을 저장하지 않는다 (임시 파일 없음)
 *  - 확장자(.txt/.csv) + MIME 을 함께 확인한다. 파일명은 확장자 확인에만 쓰고 경로·저장에 쓰지 않는다
 *  - 1MB, 1,000개, 항목당 500자 제한. null byte·제어 문자 제거. 바이너리로 보이면 거부
 *  - 파일 내용은 로그에 남기지 않는다 (오류 행은 번호와 이유만 돌려준다)
 */

export type { StyleImportPreview };

const ALLOWED_MIME: Record<"txt" | "csv", string[]> = {
  // 브라우저·OS 마다 다르게 보낸다 (윈도우 Excel 이 깔린 PC 는 CSV 를 application/vnd.ms-excel 로 보낸다). 빈 값은 확장자로 판단
  txt: ["text/plain", ""],
  csv: ["text/csv", "application/csv", "text/x-csv", "application/vnd.ms-excel", "text/plain", ""],
};

/** CSV type 값: 영어(권장) + 한국어 별칭 */
const TYPE_ALIASES: Record<string, StyleImportKind> = {
  ...Object.fromEntries(STYLE_IMPORT_KINDS.map((k) => [k, k])),
  "title-pattern": "title_pattern",
  titlepattern: "title_pattern",
  "example-phrase": "example_phrase",
  "banned-phrase": "banned_phrase",
  훅: "hook",
  제목패턴: "title_pattern",
  "제목 패턴": "title_pattern",
  규칙: "rule",
  "자주 쓰는 표현": "example_phrase",
  자주쓰는표현: "example_phrase",
  "금지 표현": "banned_phrase",
  금지표현: "banned_phrase",
};

function emptyItems(): Record<StyleImportKind, string[]> {
  return { hook: [], cta: [], title_pattern: [], rule: [], example_phrase: [], banned_phrase: [] };
}

/** 확장자·MIME·크기 확인 → 바이트 */
async function readUpload(file: File): Promise<{ type: "txt" | "csv"; bytes: Uint8Array }> {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext !== "txt" && ext !== "csv") throw new AppError("FILE_TYPE", ".txt 또는 .csv 파일만 올릴 수 있습니다.", 415);
  const mime = (file.type || "").toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME[ext].includes(mime)) throw new AppError("FILE_TYPE", "텍스트(.txt) 또는 CSV(.csv) 파일이 아닙니다.", 415);
  if (file.size > STYLE_IMPORT_MAX_BYTES) throw new AppError("FILE_TOO_LARGE", "1MB 이하 파일만 올릴 수 있습니다.", 413);
  if (file.size === 0) throw new AppError("FILE_EMPTY", "빈 파일입니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > STYLE_IMPORT_MAX_BYTES) throw new AppError("FILE_TOO_LARGE", "1MB 이하 파일만 올릴 수 있습니다.", 413);
  // 텍스트 파일에는 null byte 가 거의 없다. 앞부분에 많으면 바이너리(이미지·엑셀 등)로 본다
  const head = bytes.subarray(0, 8192);
  let nulls = 0;
  for (const b of head) if (b === 0) nulls++;
  if (nulls > 4) throw new AppError("FILE_TYPE", "텍스트 파일이 아닙니다. 엑셀 파일은 'CSV UTF-8' 로 저장해서 올려 주세요.", 415);
  return { type: ext, bytes };
}

/** UTF-8 로 읽고, 깨지면 한국어 윈도우 인코딩(CP949, 예전 Excel CSV)으로 읽는다 */
function decode(bytes: Uint8Array): { text: string; cp949: boolean } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), cp949: false };
  } catch {
    try {
      return { text: new TextDecoder("euc-kr", { fatal: true }).decode(bytes), cp949: true };
    } catch {
      throw new AppError("FILE_ENCODING", "글자를 읽을 수 없습니다. 파일을 UTF-8 로 저장해서 다시 올려 주세요.");
    }
  }
}

/** RFC 4180 CSV: 따옴표 안 쉼표·줄바꿈, "" 이스케이프를 처리한다. 각 행의 시작 줄 번호를 함께 돌려준다 */
function parseCsv(text: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows;
}

export async function previewStyleImport(file: File, target: string | null): Promise<StyleImportPreview> {
  const { type, bytes } = await readUpload(file);
  const { text, cp949 } = decode(bytes);
  const items = emptyItems();
  const seen = new Set<string>();
  const errors: StyleImportPreview["errors"] = [];
  let errorCount = 0;
  let found = 0;
  let duplicateInFile = 0;
  let truncated = false;

  const fail = (line: number, reason: string) => {
    errorCount++;
    if (errors.length < 50) errors.push({ line, reason });
  };

  const add = (kind: StyleImportKind, raw: string, line: number) => {
    // CSV 다운로드가 수식 주입 방지로 붙인 ' 를 뗀다 ('=..., '+..., '-..., '@...)
    const value = cleanStyleText(raw).replace(/^'(?=[=+\-@])/, "");
    if (!value) return;
    if (value.length > STYLE_IMPORT_MAX_LEN) return fail(line, `${STYLE_IMPORT_MAX_LEN}자를 넘는 항목 (${value.length}자)`);
    if (found >= STYLE_IMPORT_MAX_ITEMS) {
      truncated = true;
      return;
    }
    found++;
    const key = `${kind}:${styleItemKey(value)}`;
    if (seen.has(key)) {
      duplicateInFile++;
      return;
    }
    seen.add(key);
    items[kind].push(value);
  };

  if (type === "txt") {
    const kind = STYLE_IMPORT_KINDS.find((k) => k === target);
    if (!kind) throw new AppError("VALIDATION", "TXT 파일은 추가할 항목(Hook, CTA, 제목 패턴 …)을 먼저 골라 주세요.");
    text.split(/\r\n|\r|\n/).forEach((l, i) => add(kind, l, i + 1));
  } else {
    const rows = parseCsv(text);
    rows.forEach(({ line, cells }, index) => {
      if (cells.every((c) => !c.trim())) return; // 빈 줄
      const typeCell = cleanStyleText(cells[0] ?? "").toLowerCase();
      // 첫 줄이 머리글(type,text)이면 건너뛴다
      if (index === 0 && (typeCell === "type" || typeCell === "종류")) return;
      const kind = TYPE_ALIASES[typeCell] ?? TYPE_ALIASES[typeCell.replace(/\s+/g, "")];
      if (!kind) return fail(line, typeCell ? `알 수 없는 type '${typeCell.slice(0, 30)}'` : "type 이 비어 있음");
      // text 에 쉼표가 있는데 따옴표로 감싸지 않은 경우도 살린다
      const value = cells.slice(1).join(",");
      if (!cleanStyleText(value)) return fail(line, "text 가 비어 있음");
      add(kind, value, line);
    });
  }

  if (!found && !errorCount) throw new AppError("FILE_EMPTY", "파일에서 추가할 항목을 찾지 못했습니다.");
  return { fileType: type, found, items, duplicateInFile, errors, errorCount, truncated, decodedAsCp949: cp949 };
}
