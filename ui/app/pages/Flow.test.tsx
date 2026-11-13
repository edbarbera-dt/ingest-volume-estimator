import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { Flow } from "./Flow";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { FIXTURES, dqlMock } from "../../test/mocks";
import { FLOW_BUCKET_RECORDS, FLOW_QUERIES } from "../queries/flow";
import { clearTopologyCache } from "../hooks/useFlowTopology";
import routing1h from "../shared/flow/__fixtures__/routing-1h.json";
import out1h from "../shared/flow/__fixtures__/out-1h.json";
import sources1h from "../shared/flow/__fixtures__/sources-1h.json";
import out24h from "../shared/flow/__fixtures__/out-24h.json";
import logsRouting from "../shared/flow/__fixtures__/settings-logs-routing.json";
import logsPipelines from "../shared/flow/__fixtures__/settings-logs-pipelines.json";

jest.mock("@dynatrace-sdk/react-hooks", () => ({ useDql: jest.fn(), useAppState: jest.fn(), useSetAppState: jest.fn() }));
jest.mock("@dynatrace-sdk/client-classic-environment-v2", () => ({ settingsObjectsClient: { getSettingsObjects: jest.fn() } }));
jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").chartsMock());

FIXTURES[FLOW_QUERIES["1h"].routing] = routing1h;
FIXTURES[FLOW_QUERIES["1h"].out] = out1h;
FIXTURES[FLOW_QUERIES["1h"].sources] = sources1h;
FIXTURES[FLOW_BUCKET_RECORDS] = out24h;

const getObjects = settingsObjectsClient.getSettingsObjects as jest.Mock;

const render = async () => {
  renderWithRoot(
    <MemoryRouter>
      <TimeframeProvider>
        <Flow />
      </TimeframeProvider>
    </MemoryRouter>,
  );
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  clearTopologyCache();
  (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
  (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn(), isLoading: false });
  (useDql as jest.Mock).mockImplementation(dqlMock("data"));
  getObjects.mockImplementation((p: { schemaIds: string }) =>
    Promise.resolve({
      items:
        p.schemaIds === "builtin:openpipeline.logs.routing" ? logsRouting : p.schemaIds === "builtin:openpipeline.logs.pipelines" ? logsPipelines : [],
    }),
  );
});

describe("Flow", () => {
  it("draws the logs flow with host and retention badges", async () => {
    await render();
    expect(screen.getByText("OneAgent")).toBeInTheDocument();
    expect(screen.getByText("Default pipeline")).toBeInTheDocument();
    expect(screen.getByText("default_logs")).toBeInTheDocument();
    expect(screen.getByText("3 hosts")).toBeInTheDocument();
    expect(screen.getByText("35 d")).toBeInTheDocument();
    expect(screen.getByText("EasyTrade Credit Card Pipeline")).toBeInTheDocument();
    expect(screen.getByText(/average billed bytes per record/)).toBeInTheDocument();
  });

  it("switches to METRICS and explains the records/s view", async () => {
    await render();
    fireEvent.click(screen.getByRole("tab", { name: "METRICS" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/billed by data points/)).toBeInTheDocument();
    expect(screen.getByText("default_metrics")).toBeInTheDocument();
  });

  it("falls back to raw ids when the settings scope is missing", async () => {
    getObjects.mockRejectedValue(Object.assign(new Error("Forbidden"), { response: { status: 403 } }));
    await render();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/settings:objects:read/)).toBeInTheDocument();
    expect(screen.getByText("OneAgent")).toBeInTheDocument();
  });

  it("shows an empty state when there is no traffic", async () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("empty"));
    getObjects.mockResolvedValue({ items: [] });
    await render();
    expect(screen.getByText("No logs traffic in this window.")).toBeInTheDocument();
  });

  it("names the metrics scope when the queries are denied", async () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("forbidden"));
    await render();
    expect(screen.getAllByText(/storage:metrics:read/).length).toBeGreaterThan(0);
  });

  it("opens a pipeline sheet with processors and routes", async () => {
    await render();
    fireEvent.click(screen.getByRole("button", { name: /^EasyTrade Credit Card Pipeline/ }));
    expect(await screen.findByText(/^Processors \(\d+\)$/)).toBeInTheDocument();
    expect(screen.getByText("Routes into this pipeline")).toBeInTheDocument();
  });

  it("opens a bucket sheet with billed bytes, retention and an Overview link", async () => {
    await render();
    fireEvent.click(screen.getByRole("button", { name: /^default_logs/ }));
    expect(await screen.findByText(/Billed bytes \(last 24 h\): 4\.93 GiB/)).toBeInTheDocument();
    expect(screen.getByText("Retention: 35 days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in Overview" })).toBeInTheDocument();
  });

  it("explains the built-in default pipeline", async () => {
    await render();
    fireEvent.click(screen.getByRole("button", { name: /^Default pipeline/ }));
    expect(await screen.findByText(/Built-in pipeline/)).toBeInTheDocument();
  });
});
