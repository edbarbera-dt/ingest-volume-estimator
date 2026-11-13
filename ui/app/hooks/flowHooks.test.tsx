import { renderHook } from "@testing-library/react";
import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { fetchTopology } from "./fetchTopology";
import { useFlowMetrics } from "./useFlowMetrics";
import logsRouting from "../shared/flow/__fixtures__/settings-logs-routing.json";
import logsPipelines from "../shared/flow/__fixtures__/settings-logs-pipelines.json";
import { FLOW_QUERIES } from "../queries/flow";

jest.mock("@dynatrace-sdk/client-classic-environment-v2", () => ({
  settingsObjectsClient: { getSettingsObjects: jest.fn() },
}));
jest.mock("@dynatrace-sdk/react-hooks", () => ({ useDql: jest.fn() }));

const getObjects = settingsObjectsClient.getSettingsObjects as jest.Mock;

describe("fetchTopology", () => {
  beforeEach(() => getObjects.mockReset());

  it("reads all four schemas per configuration and pages through results", async () => {
    getObjects.mockImplementation((p: { schemaIds?: string; nextPageKey?: string }) => {
      if (p.nextPageKey === "page2") return Promise.resolve({ items: logsPipelines.slice(2) });
      if (p.schemaIds === "builtin:openpipeline.logs.routing") return Promise.resolve({ items: logsRouting });
      if (p.schemaIds === "builtin:openpipeline.logs.pipelines") return Promise.resolve({ items: logsPipelines.slice(0, 2), nextPageKey: "page2" });
      return Promise.resolve({ items: [] });
    });
    const r = await fetchTopology("logs");
    expect(getObjects).toHaveBeenCalledWith(expect.objectContaining({ schemaIds: "builtin:openpipeline.logs.data-forwarding" }));
    expect(r.topology.pipelines.size).toBe(5);
    expect(r.topology.routes.get("logs|Credit Card Order Logs")).toBeDefined();
    expect(r.missingScope).toBe(false);
  });

  it("skips schemas that don't exist", async () => {
    getObjects.mockRejectedValue(Object.assign(new Error("The specified schema or scope is not found"), { response: { status: 404 } }));
    const r = await fetchTopology("events");
    expect(r.missingScope).toBe(false);
    expect(r.topology.pipelines.size).toBe(0);
  });

  it("flags a missing settings scope", async () => {
    getObjects.mockRejectedValue(Object.assign(new Error("Forbidden"), { response: { status: 403 } }));
    expect((await fetchTopology("metrics")).missingScope).toBe(true);
  });
});

describe("useFlowMetrics", () => {
  it("queries the window ending now and 24h for the bytes estimate", () => {
    (useDql as jest.Mock).mockReturnValue({ data: { records: [] }, isLoading: false, error: null, forceRefetch: jest.fn() });
    const { result } = renderHook(() => useFlowMetrics("5m"));
    const calls = (useDql as jest.Mock).mock.calls as [{ query: string; defaultTimeframeStart: string; defaultTimeframeEnd: string }][];
    const routing = calls.find(([p]) => p.query === FLOW_QUERIES["5m"].routing)![0];
    expect(new Date(routing.defaultTimeframeEnd).getTime() - new Date(routing.defaultTimeframeStart).getTime()).toBe(300_000);
    const spans = calls.map(([p]) => new Date(p.defaultTimeframeEnd).getTime() - new Date(p.defaultTimeframeStart).getTime());
    expect(spans).toContain(86_400_000);
    expect(result.current.data).toBeDefined();
  });
});
