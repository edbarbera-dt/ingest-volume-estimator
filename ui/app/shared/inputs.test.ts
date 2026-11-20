import { defaultInputs, parseInputs } from "./inputs";

describe("extrapolation inputs", () => {
  it("defaults to the design drivers and a multiplier of 1", () => {
    const d = defaultInputs();
    expect(d.drivers).toEqual({ logs: "hosts", traces: "services", metrics: "hosts", events: "hosts" });
    expect(d.multiplier).toBe(1);
    expect(d.driverOverrides).toEqual({});
  });
  it("falls back to defaults for corrupt input", () => {
    expect(parseInputs("nope")).toEqual(defaultInputs());
    expect(parseInputs(null)).toEqual(defaultInputs());
  });
  it("keeps valid values and drops invalid ones", () => {
    const p = parseInputs({
      drivers: { logs: "pods", traces: "nonsense" },
      driverOverrides: { hosts: 5, pods: -1 },
      prodCounts: { hosts: 200, services: "x" },
      multiplier: 1.5,
      retentionDays: { logs: 90, traces: -3 },
    });
    expect(p.drivers.logs).toBe("pods");
    expect(p.drivers.traces).toBe("services");
    expect(p.driverOverrides).toEqual({ hosts: 5 });
    expect(p.prodCounts.hosts).toBe(200);
    expect(p.prodCounts.services).toBe(defaultInputs().prodCounts.services);
    expect(p.multiplier).toBe(1.5);
    expect(p.retentionDays.logs).toBe(90);
    expect(p.retentionDays.traces).toBe(defaultInputs().retentionDays.traces);
  });
  it("reads overrides saved under the pre-1.0 key", () => {
    expect(parseInputs({ pocOverrides: { hosts: 4, pods: -2 } }).driverOverrides).toEqual({ hosts: 4 });
  });
  it("prefers the current overrides key over the pre-1.0 key", () => {
    expect(parseInputs({ driverOverrides: { hosts: 1 }, pocOverrides: { hosts: 9 } }).driverOverrides).toEqual({ hosts: 1 });
  });
  it("accepts a multiplier of 0", () => {
    expect(parseInputs({ multiplier: 0 }).multiplier).toBe(0);
  });
});
