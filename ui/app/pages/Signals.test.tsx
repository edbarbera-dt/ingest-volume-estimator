import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Signals } from "./Signals";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { FIXTURES, dqlMock } from "../../test/mocks";
import { LOGS_BY_SOURCE, primaryFieldBreakdown } from "../queries/breakdown";
import logsBySource from "../queries/__fixtures__/BREAKDOWN_logs-source.json";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));
jest.mock("@dynatrace/strato-components/forms", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").formsWithNativeSelect());
jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").chartsMock());

FIXTURES[LOGS_BY_SOURCE] = logsBySource;

const BY_CLUSTER = primaryFieldBreakdown("logs", "k8s.cluster.name").query;
const BY_TEAM = primaryFieldBreakdown("logs", "primary_tags.team").query;
FIXTURES[BY_CLUSTER] = [
  { key: "prod-eu", value: 600, records: "6" },
  { key: "(none)", value: 400, records: "4" },
];
FIXTURES[BY_TEAM] = [{ key: "payments", value: 100, records: "1" }];

/** Picks a value in the i-th picker of the visible tab (0: Break down by, 1: Field). */
const choose = (i: number, value: string) => {
  fireEvent.change(document.querySelectorAll("select")[i], { target: { value } });
};

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

  it("breaks down by a primary Grail field and flags records that lack it", () => {
    const mock = jest.fn(dqlMock("data"));
    (useDql as jest.Mock).mockImplementation(mock);
    render();
    choose(0, "primary");
    fireEvent.click(screen.getByRole("button", { name: "Run breakdown" }));
    expect(mock.mock.calls.some(([p, o]) => p.query === BY_CLUSTER && o?.enabled !== false)).toBe(true);
    expect(screen.getByTestId("bars")).toHaveTextContent("prod-eu");
    expect(screen.getByText(/40(\.0)?\s?% of content bytes have no k8s.cluster.name/)).toBeInTheDocument();
  });

  it("breaks down by a custom primary tag once a valid key is entered", () => {
    const mock = jest.fn(dqlMock("data"));
    (useDql as jest.Mock).mockImplementation(mock);
    render();
    choose(0, "primary");
    choose(1, "custom-tag");
    const run = () => screen.getByRole("button", { name: "Run breakdown" });
    expect(run()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/e.g. team/), { target: { value: "bad key" } });
    expect(run()).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/e.g. team/), { target: { value: "team" } });
    fireEvent.click(run());
    expect(mock.mock.calls.some(([p, o]) => p.query === BY_TEAM && o?.enabled !== false)).toBe(true);
    expect(screen.getByText(/Every record in this window has primary_tags.team set/)).toBeInTheDocument();
  });
});
