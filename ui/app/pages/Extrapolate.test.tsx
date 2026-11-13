import React from "react";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Extrapolate } from "./Extrapolate";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { dqlMock } from "../../test/mocks";
import { defaultInputs } from "../shared/inputs";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));

const render = () =>
  renderWithRoot(
    <MemoryRouter>
      <TimeframeProvider>
        <Extrapolate />
      </TimeframeProvider>
    </MemoryRouter>,
  );

const stateFor = (inputs: unknown) => ({ key }: { key: string }) =>
  key === "extrapolation-inputs"
    ? { data: { value: JSON.stringify(inputs) }, isError: false, isLoading: false }
    : { data: undefined, isError: false, isLoading: false };

beforeEach(() => {
  (useDql as jest.Mock).mockImplementation(dqlMock("data"));
  (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(undefined), isLoading: false });
});

describe("Extrapolate", () => {
  it("prefills production with POC counts and projects a monthly cost", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    expect(screen.getByText(/Projected monthly cost: \$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
    expect(screen.getByText("Hosts (detected 3)")).toBeInTheDocument();
  });

  it("greys out a signal whose driver count is 0 and prompts for a manual value", () => {
    const inputs = { ...defaultInputs(), drivers: { ...defaultInputs().drivers, logs: "pods" }, prodCounts: { hosts: 30, services: 110, pods: 100, clusters: 0, containers: 0 } };
    (useAppState as jest.Mock).mockImplementation(stateFor(inputs));
    render();
    expect(screen.getByText(/driver count of 0/)).toBeInTheDocument();
  });

  it("names missing scopes", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    (useDql as jest.Mock).mockImplementation(dqlMock("forbidden"));
    render();
    expect(screen.getAllByText(/storage:smartscape:read/).length).toBeGreaterThan(0);
  });
});
