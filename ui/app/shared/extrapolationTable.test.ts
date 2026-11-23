import { buildProjection, driverRates, effectiveDrivers, normaliseAttribution, projectionCsv } from "./extrapolationTable";
import { defaultInputs, newUnit, type ExtrapolationInputs } from "./inputs";
import { LIST_PRICES } from "./rateCard";

const detected = { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 };
const perDay = { logs: 0.7, traces: 8.4, metrics: 314_000, events: 0.0004 };

const withUnits = (units: ExtrapolationInputs["units"], p: Partial<ExtrapolationInputs> = {}): ExtrapolationInputs => ({
  ...defaultInputs(),
  units,
  ...p,
});

describe("effectiveDrivers", () => {
  it("uses overrides over detected counts", () => {
    expect(effectiveDrivers(detected, { pods: 20 })).toEqual({ ...detected, pods: 20 });
  });
});

describe("normaliseAttribution", () => {
  it("turns weights into fractions", () => {
    expect(normaliseAttribution({ hosts: 3, pods: 1 })).toMatchObject({ hosts: 0.75, pods: 0.25, clusters: 0 });
    expect(normaliseAttribution({})).toMatchObject({ hosts: 0, pods: 0 });
  });
});

describe("driverRates", () => {
  it("splits a signal's volume across drivers by weight and count", () => {
    const attribution = { ...defaultInputs().attribution, logs: { hosts: 60, containers: 40 } };
    const rates = driverRates(attribution, detected, perDay, defaultInputs().retentionDays, LIST_PRICES);
    const hosts = rates.find((r) => r.driver === "hosts");
    const containers = rates.find((r) => r.driver === "containers");
    expect(hosts?.perDay.logs).toBeCloseTo((0.7 * 0.6) / 3);
    expect(containers?.perDay.logs).toBeCloseTo((0.7 * 0.4) / 15);
    expect(hosts?.cost.totalCost).toBeGreaterThan(0);
  });

  it("flags a driver with no current count that has volume attributed to it", () => {
    const attribution = { ...defaultInputs().attribution, logs: { pods: 100 } };
    const pods = driverRates(attribution, detected, perDay, defaultInputs().retentionDays, LIST_PRICES).find(
      (r) => r.driver === "pods",
    );
    expect(pods?.unrated).toBe(true);
    expect(pods?.perDay.logs).toBeNull();
  });
});

describe("buildProjection", () => {
  it("reproduces current cost with one unit equal to the current environment", () => {
    const p = buildProjection(withUnits([newUnit({ counts: { ...detected } })]), detected, perDay, LIST_PRICES);
    expect(p.total.totalCost).toBeCloseTo(p.currentTotal.totalCost, 9);
    for (const r of p.rows) expect(r.prodPerDay).toBeCloseTo(r.currentPerDay, 9);
  });

  it("scales linearly with quantity and traffic factor, and units sum to the total", () => {
    const a = newUnit({ name: "A", counts: { ...detected } });
    const base = buildProjection(withUnits([a]), detected, perDay, LIST_PRICES).total.totalCost;
    const p = buildProjection(
      withUnits([{ ...a, quantity: 3 }, newUnit({ name: "B", counts: { ...detected }, trafficFactor: 2 })]),
      detected,
      perDay,
      LIST_PRICES,
    );
    expect(p.total.totalCost).toBeCloseTo(base * 5, 6);
    expect(p.units[0].subtotal.totalCost).toBeCloseTo(base * 3, 6);
    expect(p.units.reduce((s, u) => s + u.subtotal.totalCost, 0)).toBeCloseTo(p.total.totalCost, 6);
    expect(p.projectedCounts.hosts).toBe(12);
  });

  it("adds cost for extra pods only when a signal is attributed to pods", () => {
    const inputs = withUnits([newUnit({ counts: { ...detected, pods: 10 } })], {
      driverOverrides: { pods: 5 },
      attribution: { ...defaultInputs().attribution, logs: { hosts: 50, pods: 50 } },
    });
    const p = buildProjection(inputs, detected, perDay, LIST_PRICES);
    const logs = p.rows.find((r) => r.signal === "logs");
    // Hosts unchanged (half the logs), pods doubled (the other half twice over).
    expect(logs?.prodPerDay).toBeCloseTo(0.7 * 0.5 + 0.7 * 0.5 * 2);
    expect(p.rows.find((r) => r.signal === "traces")?.prodPerDay).toBeCloseTo(8.4);
  });

  it("lists signals attributed to no driver", () => {
    const inputs = withUnits([], { attribution: { ...defaultInputs().attribution, events: {} } });
    expect(buildProjection(inputs, detected, perDay, LIST_PRICES).unattributed).toEqual(["events"]);
  });
});

describe("projectionCsv", () => {
  it("writes per-signal, unit and per-driver sections", () => {
    const p = buildProjection(withUnits([newUnit({ name: 'Prod, "east"', counts: { ...detected } })]), detected, perDay, LIST_PRICES);
    const sections = projectionCsv(p, "USD").trim().split("\n\n");
    expect(sections).toHaveLength(3);
    expect(sections[0].split("\n")).toHaveLength(1 + 4 + 1);
    expect(sections[0]).toMatch(/^signal,unit,current_per_day,current_cost_month_USD,/);
    expect(sections[1]).toContain('"Prod, ""east"""');
    expect(sections[2].split("\n")).toHaveLength(1 + 5);
  });
});
