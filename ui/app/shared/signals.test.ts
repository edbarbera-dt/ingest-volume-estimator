import {
  SIGNALS,
  SIGNAL_META,
  parseBillingEventType,
  signalColor,
} from "./signals";

describe("signals", () => {
  it("lists the four signals in display order", () => {
    expect(SIGNALS).toEqual(["logs", "traces", "metrics", "events"]);
  });

  it.each([
    ["Log Management & Analytics - Ingest & Process", "logs", "ingest"],
    ["Traces - Ingest & Process", "traces", "ingest"],
    ["Metrics - Ingest & Process", "metrics", "ingest"],
    ["Events - Ingest & Process", "events", "ingest"],
    ["Log Management & Analytics - Retain", "logs", "retain"],
    ["Traces - Retain", "traces", "retain"],
    ["Events - Retain", "events", "retain"],
  ])("maps %s", (eventType, signal, kind) => {
    expect(parseBillingEventType(eventType)).toEqual({ signal, kind });
  });

  it.each([
    "Log Management & Analytics - Query",
    "Files - Retain",
    "Full-Stack Monitoring",
    "",
    "garbage",
  ])("returns null for non-volume type %p", (eventType) => {
    expect(parseBillingEventType(eventType)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseBillingEventType(undefined as unknown as string)).toBeNull();
  });

  it("uses GiB for byte signals and data points for metrics", () => {
    expect(SIGNAL_META.logs.unit).toBe("GiB");
    expect(SIGNAL_META.traces.unit).toBe("GiB");
    expect(SIGNAL_META.events.unit).toBe("GiB");
    expect(SIGNAL_META.metrics.unit).toBe("data points");
  });

  it("has the design default drivers", () => {
    expect(SIGNAL_META.logs.defaultDriver).toBe("hosts");
    expect(SIGNAL_META.traces.defaultDriver).toBe("services");
    expect(SIGNAL_META.metrics.defaultDriver).toBe("hosts");
    expect(SIGNAL_META.events.defaultDriver).toBe("hosts");
  });

  it("gives every signal a distinct colour", () => {
    const colours = SIGNALS.map(signalColor);
    expect(new Set(colours).size).toBe(4);
    colours.forEach((c) => expect(typeof c).toBe("string"));
  });
});
