import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Signals } from "./Signals";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { FIXTURES, dqlMock } from "../../test/mocks";
import { LOGS_BY_SOURCE } from "../queries/breakdown";
import logsBySource from "../queries/__fixtures__/BREAKDOWN_logs-source.json";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));
jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").chartsMock());

FIXTURES[LOGS_BY_SOURCE] = logsBySource;

const render = () =>
  renderWithRoot(
    <MemoryRouter>
      <TimeframeProvider>
        <Signals />
      </TimeframeProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
  (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn(), isLoading: false });
});

describe("Signals", () => {
  it("does not run the breakdown until asked, and shows a scan estimate first", () => {
    const mock = jest.fn(dqlMock("data"));
    (useDql as jest.Mock).mockImplementation(mock);
    render();
    expect(screen.getByTestId("scan-hint")).toHaveTextContent(/scanned/);
    const ranBreakdown = () =>
      mock.mock.calls.some(([p, o]) => p.query === LOGS_BY_SOURCE && o?.enabled !== false);
    expect(ranBreakdown()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run breakdown" }));
    expect(ranBreakdown()).toBe(true);
    expect(screen.getByTestId("bars")).toHaveTextContent("Container Output");
    expect(screen.getAllByText(/Content bytes are smaller than billed bytes/).length).toBeGreaterThan(0);
  });

  it("names the missing scope when the breakdown is denied", () => {
    (useDql as jest.Mock).mockImplementation(dqlMock((q) => (q === LOGS_BY_SOURCE ? "forbidden" : "data")));
    render();
    fireEvent.click(screen.getByRole("button", { name: "Run breakdown" }));
    expect(screen.getAllByText(/storage:logs:read/).length).toBeGreaterThan(0);
  });
});
