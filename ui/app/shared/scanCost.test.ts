import { QUERY_PRICE_PER_GIB_SCANNED, scanEstimate, topWithShare } from "./scanCost";

describe("scanEstimate", () => {
  it("estimates scanned GiB and cost for raw-table breakdowns", () => {
    const e = scanEstimate({ signal: "logs", source: "raw", measure: "content bytes" }, 0.7, 1, "USD");
    expect(e.scannedGiB).toBeCloseTo(0.7);
    expect(e.cost).toBeCloseTo(0.7 * QUERY_PRICE_PER_GIB_SCANNED);
  });
  it("scales with the window and converts currency", () => {
    const e = scanEstimate({ signal: "traces", source: "raw", measure: "spans" }, 8, 7, "EUR");
    expect(e.scannedGiB).toBeCloseTo(56);
    expect(e.cost).toBeCloseTo(56 * 0.0035 * 0.87198);
  });
  it("has no scan cost for billing-event breakdowns", () => {
    const e = scanEstimate({ signal: "events", source: "billing", measure: "billed bytes" }, 1, 1, "USD");
    expect(e.scannedGiB).toBeNull();
    expect(e.note).toMatch(/billing usage events/);
  });
  it("has no scan cost for metric series metadata", () => {
    const e = scanEstimate({ signal: "metrics", source: "raw", measure: "series" }, 1, 1, "USD");
    expect(e.cost).toBeNull();
  });
});

describe("topWithShare", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, value: 12 - i, records: null, share: (12 - i) / 78 }));
  it("keeps the top N and folds the rest into Other", () => {
    const top = topWithShare(rows, 10);
    expect(top).toHaveLength(11);
    expect(top[10]).toMatchObject({ key: "Other (2)", value: 3 });
    expect(top[10].share).toBeCloseTo(3 / 78);
  });
  it("returns all rows when there are N or fewer", () => {
    expect(topWithShare(rows.slice(0, 3), 10)).toHaveLength(3);
  });
});
