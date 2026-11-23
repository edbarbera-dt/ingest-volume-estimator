import { defaultInputs, newUnit, parseInputs } from "./inputs";

describe("parseInputs", () => {
  it("defaults each signal to 100% of its default driver, with no units", () => {
    const d = parseInputs(undefined);
    expect(d.version).toBe(2);
    expect(d.attribution).toEqual({ logs: { hosts: 100 }, traces: { services: 100 }, metrics: { hosts: 100 }, events: { hosts: 100 } });
    expect(d.units).toEqual([]);
    expect(parseInputs("not json")).toEqual(defaultInputs());
  });

  it("round-trips version 2 inputs and drops invalid values", () => {
    const unit = { ...newUnit({ name: "Prod cluster" }), counts: { hosts: 8, services: 20, pods: 150, clusters: 1, containers: 300 }, quantity: 4, trafficFactor: 1.3 };
    const raw = {
      ...defaultInputs(),
      attribution: { logs: { hosts: 60, pods: 40, clusters: -5 }, traces: "x" },
      units: [unit, null, { name: "Bad", quantity: -1, counts: { hosts: "3" } }],
      driverOverrides: { pods: 10, hosts: -1 },
    };
    const p = parseInputs(JSON.stringify(raw));
    expect(p.attribution.logs).toEqual({ hosts: 60, pods: 40 });
    expect(p.attribution.traces).toEqual({ services: 100 });
    expect(p.units).toHaveLength(2);
    expect(p.units[0]).toEqual(unit);
    expect(p.units[1]).toMatchObject({ name: "Bad", quantity: 1, trafficFactor: 1, counts: { hosts: 0 } });
    expect(p.driverOverrides).toEqual({ pods: 10 });
  });

  it("migrates version 1 inputs to an attribution and one Production unit", () => {
    const v1 = {
      drivers: { logs: "pods", traces: "services", metrics: "hosts", events: "bogus" },
      pocOverrides: { hosts: 6 },
      prodCounts: { hosts: 30, services: 110, pods: 0, clusters: 0, containers: 0 },
      multiplier: 1.5,
      retentionDays: { logs: 90 },
    };
    const p = parseInputs(v1);
    expect(p.attribution.logs).toEqual({ pods: 100 });
    expect(p.attribution.events).toEqual({ hosts: 100 });
    expect(p.driverOverrides).toEqual({ hosts: 6 });
    expect(p.retentionDays.logs).toBe(90);
    expect(p.retentionDays.traces).toBe(10);
    expect(p.units).toEqual([
      { id: "u-production", name: "Production", counts: v1.prodCounts, quantity: 1, trafficFactor: 1.5 },
    ]);
  });

  it("migrates version 1 inputs without production counts to no units", () => {
    expect(parseInputs({ prodCounts: { hosts: 0 }, multiplier: 2 }).units).toEqual([]);
  });
});
