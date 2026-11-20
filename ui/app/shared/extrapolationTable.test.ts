import { buildProjection, effectiveDrivers, projectionCsv } from "./extrapolationTable";
import { defaultInputs } from "./inputs";
import { LIST_PRICES } from "./rateCard";

const detected = { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 };
const perDay = { logs: 0.7, traces: 8.4, metrics: 314_000, events: 0.0004 };

describe("effectiveDrivers", () => {
  it("uses overrides over detected counts", () => {
    expect(effectiveDrivers(detected, { pods: 20 })).toEqual({ ...detected, pods: 20 });
  });
});

describe("buildProjection", () => {
  it("projects every signal using its chosen driver", () => {
    const inputs = { ...defaultInputs(), prodCounts: { hosts: 300, services: 110, pods: 0, clusters: 0, containers: 0 } };
    const p = buildProjection(inputs, detected, perDay, LIST_PRICES);
    const logs = p.rows.find((r) => r.signal === "logs");
    expect(logs?.driver).toBe("hosts");
    expect(logs?.currentDriverCount).toBe(3);
    expect(logs?.prodCount).toBe(300);
    expect(logs?.prodPerDay).toBeCloseTo(70);
    const traces = p.rows.find((r) => r.signal === "traces");
    expect(traces?.prodPerDay).toBeCloseTo(84);
    expect(p.total.totalCost).toBeCloseTo(p.rows.reduce((a, r) => a + r.totalCost, 0));
  });

  it("disables a signal whose driver count is 0 and leaves it out of the total", () => {
    const inputs = { ...defaultInputs(), drivers: { ...defaultInputs().drivers, logs: "pods" as const }, prodCounts: { hosts: 30, services: 11, pods: 100, clusters: 0, containers: 0 } };
    const p = buildProjection(inputs, detected, perDay, LIST_PRICES);
    const logs = p.rows.find((r) => r.signal === "logs");
    expect(logs?.disabled).toBe(true);
    expect(p.total.totalCost).toBeCloseTo(p.rows.filter((r) => !r.disabled).reduce((a, r) => a + r.totalCost, 0));
  });
});

describe("projectionCsv", () => {
  it("writes a header, one row per signal and a total", () => {
    const inputs = { ...defaultInputs(), prodCounts: { hosts: 300, services: 110, pods: 0, clusters: 0, containers: 0 } };
    const csv = projectionCsv(buildProjection(inputs, detected, perDay, LIST_PRICES), "USD");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "signal,unit,driver,current_per_day,current_driver_count,rate_per_unit,prod_driver_count,prod_per_day,prod_per_month,ingest_cost_month_USD,retain_cost_month_USD,total_cost_month_USD",
    );
    expect(lines).toHaveLength(6);
    expect(lines[1].startsWith("Logs,GiB,hosts,0.7,3,")).toBe(true);
    expect(lines[5].startsWith("Total,")).toBe(true);
  });
  it("leaves disabled figures empty", () => {
    const inputs = { ...defaultInputs(), drivers: { ...defaultInputs().drivers, logs: "pods" as const } };
    const csv = projectionCsv(buildProjection(inputs, detected, perDay, LIST_PRICES), "USD");
    expect(csv.split("\n")[1]).toMatch(/^Logs,GiB,pods,0.7,0,,0,,,/);
  });
  it("quotes values containing commas", () => {
    const inputs = defaultInputs();
    const csv = projectionCsv(buildProjection(inputs, detected, perDay, LIST_PRICES), "USD");
    expect(csv).not.toMatch(/,,,,,,,,,,,/);
  });
});
