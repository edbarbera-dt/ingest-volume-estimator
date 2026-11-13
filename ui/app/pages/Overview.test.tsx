import React from "react";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Overview } from "./Overview";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { dqlMock } from "../../test/mocks";
import { INGEST_TOTALS } from "../queries/billing";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));
jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").chartsMock());

const render = () =>
  renderWithRoot(
    <MemoryRouter>
      <TimeframeProvider>
        <Overview />
      </TimeframeProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
  (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn(), isLoading: false });
});

describe("Overview", () => {
  it("shows per-signal volumes and the list-price chip", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("data"));
    render();
    // 5295355750 bytes = 4.93 GiB of logs
    expect(screen.getByText("4.93 GiB")).toBeInTheDocument();
    expect(screen.getByText("2.2M data points")).toBeInTheDocument();
    expect(screen.getByText("estimate, list price")).toBeInTheDocument();
    expect(screen.getByTestId("donut")).toHaveTextContent("Logs");
  });

  it("shows a loading state", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("loading"));
    render();
    expect(screen.getAllByTestId("query-loading").length).toBeGreaterThan(0);
  });

  it("shows an error with retry", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("error"));
    render();
    expect(screen.getByText("Query budget exceeded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("names the missing scope", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock("forbidden"));
    render();
    expect(screen.getAllByText(/storage:system:read/).length).toBeGreaterThan(0);
  });

  it("shows the no-billing-data state with the delay note", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock((q) => (q === INGEST_TOTALS ? "empty" : "data")));
    render();
    expect(screen.getByText("No billing data yet")).toBeInTheDocument();
    expect(screen.getByText(/about 4 hours/)).toBeInTheDocument();
  });
});
