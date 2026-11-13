import {
  parseBaselineStore,
  addBaseline,
  removeBaseline,
  setActiveBaseline,
  compareBaselines,
  changeFromBaseline,
  makeBaseline,
  type Baseline,
} from "./baselines";

const b = (id: string, logsPerDay: number): Baseline => ({
  id,
  label: `Baseline ${id}`,
  createdAt: "2026-11-13T00:00:00.000Z",
  timeframe: { start: "2026-11-06T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", days: 7 },
  volumePerDay: { logs: logsPerDay, traces: 8, metrics: 300_000, events: 0 },
  drivers: { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 },
});

describe("parseBaselineStore", () => {
  it("returns an empty store for missing or corrupt input", () => {
    const empty = { baselines: [], activeId: null };
    expect(parseBaselineStore(undefined)).toEqual(empty);
    expect(parseBaselineStore("{oops")).toEqual(empty);
    expect(parseBaselineStore('{"baselines": 5}')).toEqual(empty);
  });
  it("round-trips a valid store", () => {
    const store = { baselines: [b("a", 1)], activeId: "a" };
    expect(parseBaselineStore(JSON.stringify(store))).toEqual(store);
  });
  it("drops invalid baselines and a dangling activeId", () => {
    const raw = JSON.stringify({ baselines: [b("a", 1), { id: 3 }], activeId: "zzz" });
    const store = parseBaselineStore(raw);
    expect(store.baselines.map((x) => x.id)).toEqual(["a"]);
    expect(store.activeId).toBeNull();
  });
  it("fills missing numbers with 0", () => {
    const raw = { baselines: [{ ...b("a", 1), volumePerDay: { logs: "x" } }], activeId: null };
    expect(parseBaselineStore(raw).baselines[0].volumePerDay).toEqual({
      logs: 0,
      traces: 0,
      metrics: 0,
      events: 0,
    });
  });
});

describe("store updates", () => {
  it("adds newest first and removes", () => {
    let s = addBaseline({ baselines: [], activeId: null }, b("a", 1));
    s = addBaseline(s, b("b", 2));
    expect(s.baselines.map((x) => x.id)).toEqual(["b", "a"]);
    s = setActiveBaseline(s, "a");
    expect(s.activeId).toBe("a");
    s = removeBaseline(s, "a");
    expect(s.baselines.map((x) => x.id)).toEqual(["b"]);
    expect(s.activeId).toBeNull();
  });
  it("ignores setting an unknown active id", () => {
    const s = setActiveBaseline({ baselines: [b("a", 1)], activeId: "a" }, "nope");
    expect(s.activeId).toBe("a");
  });
});

describe("compareBaselines", () => {
  it("returns per-signal absolute and relative deltas per day", () => {
    const c = compareBaselines(b("a", 10), b("b", 15));
    expect(c.logs).toEqual({ from: 10, to: 15, delta: 5, pct: 0.5 });
  });
  it("returns null pct when the reference is 0", () => {
    expect(compareBaselines(b("a", 1), b("b", 1)).events.pct).toBeNull();
  });
});

describe("changeFromBaseline", () => {
  it("compares a current per-day volume with the baseline", () => {
    expect(changeFromBaseline(12, b("a", 10), "logs")).toEqual({ delta: 2, pct: 0.2 });
  });
  it("is null without a baseline", () => {
    expect(changeFromBaseline(12, null, "logs")).toBeNull();
  });
});

describe("makeBaseline", () => {
  it("stores per-day volumes for the timeframe and driver counts", () => {
    const made = makeBaseline({
      label: "  POC week 1  ",
      timeframe: { start: "2026-11-06T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", days: 7 },
      volumes: { logs: 7, traces: 14, metrics: 700, events: 0 },
      drivers: { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 },
      now: new Date("2026-11-13T10:00:00.000Z"),
      id: "abc",
    });
    expect(made).toEqual({
      id: "abc",
      label: "POC week 1",
      createdAt: "2026-11-13T10:00:00.000Z",
      timeframe: { start: "2026-11-06T00:00:00.000Z", end: "2026-11-13T00:00:00.000Z", days: 7 },
      volumePerDay: { logs: 1, traces: 2, metrics: 100, events: 0 },
      drivers: { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 },
    });
  });
  it("defaults an empty label to the date", () => {
    const made = makeBaseline({
      label: " ",
      timeframe: { start: "a", end: "b", days: 1 },
      volumes: { logs: 0, traces: 0, metrics: 0, events: 0 },
      drivers: { hosts: 0, services: 0, pods: 0, clusters: 0, containers: 0 },
      now: new Date("2026-11-13T10:00:00.000Z"),
    });
    expect(made.label).toBe("Baseline 2026-11-13");
    expect(made.id).toMatch(/^b-/);
  });
});
