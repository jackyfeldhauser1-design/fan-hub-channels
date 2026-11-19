export type PaidAmount = { currency: string; amount_stars?: number | null; amount_ton?: number | null };

/** Report amounts stay in their original payment units; no invented exchange rate. */
export function summarizePaid(rows: PaidAmount[]) {
  return rows.reduce(
    (sum, row) => {
      if (row.currency === "stars") sum.stars += Math.max(0, Number(row.amount_stars) || 0);
      if (row.currency === "ton") sum.ton += Math.max(0, Number(row.amount_ton) || 0);
      sum.purchases++;
      return sum;
    },
    { stars: 0, ton: 0, purchases: 0 },
  );
}

export function last24Hours(now = Date.now()) {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
}
