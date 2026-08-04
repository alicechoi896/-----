/**
 * Minimal in-memory stand-in for the subset of the Supabase JS query builder
 * that our server-side pipeline/action code actually calls. Not a general
 * PostgREST emulator -- just enough chaining (select/eq/insert/update/delete
 * /upsert/single/maybeSingle, thenable execution) to run real orchestration
 * logic against fake tables in unit-speed integration tests, per the spec's
 * allowance for AI/provider mocking in tests.
 */

type Row = Record<string, unknown>;

function genId(): string {
  return "id_" + Math.random().toString(36).slice(2, 10);
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private conflictCols: string[] = [];
  private filters: [string, unknown][] = [];
  private notNullCols: string[] = [];
  private singleMode: "single" | "maybe" | null = null;

  constructor(
    private store: FakeSupabase,
    private table: string
  ) {}

  select() {
    if (this.mode !== "insert" && this.mode !== "upsert") this.mode = "select";
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  upsert(payload: Row, opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.conflictCols = opts?.onConflict?.split(",") ?? [];
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  neq() {
    return this;
  }
  in() {
    return this;
  }
  not(col: string) {
    this.notNullCols.push(col);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.singleMode = "single";
    return this.exec();
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this.exec();
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    if (!this.store.tables[this.table]) this.store.tables[this.table] = [];
    return this.store.tables[this.table];
  }

  private matches(row: Row): boolean {
    return (
      this.filters.every(([c, v]) => row[c] === v) && this.notNullCols.every((c) => row[c] !== null && row[c] !== undefined)
    );
  }

  private async exec(): Promise<{ data: unknown; error: { message: string } | null }> {
    const rows = this.rows();

    if (this.mode === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted = payloads.map((p) => ({ id: genId(), created_at: new Date().toISOString(), ...p }));
      rows.push(...inserted);
      return { data: this.singleMode === "single" ? inserted[0] : inserted, error: null };
    }

    if (this.mode === "upsert") {
      const payload = this.payload as Row;
      const existing =
        this.conflictCols.length > 0 ? rows.find((r) => this.conflictCols.every((c) => r[c] === payload[c])) : undefined;
      const row = existing ?? { id: genId(), created_at: new Date().toISOString() };
      Object.assign(row, payload);
      if (!existing) rows.push(row);
      return { data: this.singleMode ? row : [row], error: null };
    }

    if (this.mode === "update") {
      const matched = rows.filter((r) => this.matches(r));
      matched.forEach((r) => Object.assign(r, this.payload));
      return { data: this.singleMode ? matched[0] ?? null : matched, error: null };
    }

    if (this.mode === "delete") {
      this.store.tables[this.table] = rows.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    // select
    const matched = rows.filter((r) => this.matches(r));
    if (this.singleMode === "single") {
      return matched[0] ? { data: matched[0], error: null } : { data: null, error: { message: "not found" } };
    }
    if (this.singleMode === "maybe") {
      return { data: matched[0] ?? null, error: null };
    }
    return { data: matched, error: null };
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};

  from(table: string) {
    return new FakeQueryBuilder(this, table);
  }

  storage = {
    from: () => ({
      download: async () => ({ data: null, error: { message: "storage not implemented in fake client" } }),
      upload: async () => ({ data: { path: "fake" }, error: null }),
    }),
  };

  async rpc() {
    return { data: [], error: null };
  }

  seed(table: string, row: Row) {
    if (!this.tables[table]) this.tables[table] = [];
    this.tables[table].push(row);
    return row;
  }
}
