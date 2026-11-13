import { configurationSignal, configurationsFor } from "./configuration";

describe("configurationSignal", () => {
  it.each([
    ["logs", "logs"],
    ["metrics", "metrics"],
    ["spans", "traces"],
    ["events", "events"],
    ["bizevents", "events"],
    ["system.events", "events"],
    ["security.events", "events"],
    ["sdlc.events", "events"],
    ["davis.events", "events"],
    ["davis.problems", "events"],
  ])("%s → %s", (cfg, signal) => {
    expect(configurationSignal(cfg)).toBe(signal);
  });
  it.each(["smartscape.events", "user.events", "usersessions", "", "nope"])("ignores %p", (cfg) => {
    expect(configurationSignal(cfg)).toBeNull();
  });
  it("lists the configurations per tab", () => {
    expect(configurationsFor("traces")).toEqual(["spans"]);
    expect(configurationsFor("events")).toContain("bizevents");
  });
});
