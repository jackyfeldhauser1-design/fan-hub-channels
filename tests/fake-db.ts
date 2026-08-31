/**
 * Minimaler In-Memory-Ersatz für den Supabase-Client.
 * Deckt die im Bot/Webhook genutzten Aufrufmuster ab (select/eq/gte/order/limit,
 * insert/select/single, update/eq, upsert mit onConflict, delete/lt, count head).
 */

type Row = Record<string, any>;
type Filter = { op: "eq" | "gte" | "lt" | "neq"; col: string; val: any };

let seq = 0;
const uid = () => `id_${++seq}`;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Spalten-Standardwerte je Tabelle (bilden DB-DEFAULTs nach). */
  defaults: Record<string, Row> = { invoice_intents: { paid: false }, purchases: { status: "paid" } };

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [name, rows] of Object.entries(seed)) {
      this.tables[name] = rows.map((r) => ({ id: r["id"] ?? uid(), created_at: new Date().toISOString(), ...r }));
    }
  }

  rows(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name]!;
  }

  from(name: string) {
    return new Query(this, name);
  }
}

class Query implements PromiseLike<{ data: any; count: number | null; error: null }> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private conflictKey = "id";
  private headOnly = false;
  private countMode = false;
  private limitN: number | null = null;
  private orderCol: { col: string; asc: boolean } | null = null;
  private returning = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode === "select") {
      this.countMode = !!opts?.count;
      this.headOnly = !!opts?.head;
    } else {
      this.returning = true;
    }
    return this;
  }

  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.conflictKey = opts?.onConflict ?? "id";
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

  eq(col: string, val: any) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matches(row: Row) {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return String(v ?? "") === String(f.val ?? "");
      if (f.op === "neq") return String(v ?? "") !== String(f.val ?? "");
      if (f.op === "gte") return v != null && v >= f.val;
      return v != null && v < f.val;
    });
  }

  private run() {
    const rows = this.db.rows(this.table);

    if (this.mode === "insert" || this.mode === "upsert") {
      const defaults = this.db.defaults[this.table] ?? {};
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({
        id: r["id"] ?? uid(),
        created_at: new Date().toISOString(),
        ...defaults,
        ...r,
      }));
      const written: Row[] = [];
      for (const item of items) {
        if (this.mode === "upsert") {
          const existing = rows.find(
            (r) => String(r[this.conflictKey]) === String(item[this.conflictKey]),
          );
          if (existing) {
            Object.assign(existing, item);
            written.push(existing);
            continue;
          }
        }
        rows.push(item);
        written.push(item);
      }
      const data = Array.isArray(this.payload) ? written : written[0];
      return { data: this.returning ? data : null, count: written.length, error: null };
    }

    if (this.mode === "update") {
      const hit = rows.filter((r) => this.matches(r));
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: this.returning ? hit : null, count: hit.length, error: null };
    }

    if (this.mode === "delete") {
      const keep = rows.filter((r) => !this.matches(r));
      const removed = rows.length - keep.length;
      this.db.tables[this.table] = keep;
      return { data: null, count: removed, error: null };
    }

    let hit = rows.filter((r) => this.matches(r));
    if (this.orderCol) {
      const { col, asc } = this.orderCol;
      hit = [...hit].sort((a, b) =>
        String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : asc ? 1 : -1,
      );
    }
    const count = hit.length;
    if (this.limitN != null) hit = hit.slice(0, this.limitN);
    return { data: this.headOnly ? null : hit, count: this.countMode ? count : null, error: null };
  }

  async maybeSingle() {
    const res = this.run();
    const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const res = await this.maybeSingle();
    return res;
  }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((value: { data: any; count: number | null; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected) as PromiseLike<R2>;
    }
  }
}
