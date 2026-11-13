import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Baselines } from "./Baselines";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { dqlMock } from "../../test/mocks";

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
        <Baselines />
      </TimeframeProvider>
    </MemoryRouter>,
  );

describe("Baselines", () => {
  beforeEach(() => {
    (useDql as jest.Mock).mockImplementation(dqlMock("data"));
    (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
  });

  it("shows the empty state, then saves a labelled snapshot", async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false });
    render();
    expect(screen.getByText("No baselines yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save snapshot" }));
    fireEvent.change(screen.getByPlaceholderText(/POC week 1/), { target: { value: "Before filters" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [{ key, body }] = execute.mock.calls[0] as [{ key: string; body: { value: string } }];
    expect(key).toBe("baselines");
    const stored = JSON.parse(body.value) as { baselines: { label: string; volumePerDay: { metrics: number }; drivers: { hosts: number } }[] };
    expect(stored.baselines[0].label).toBe("Before filters");
    expect(stored.baselines[0].volumePerDay.metrics).toBeCloseTo(2198476 / 7);
    expect(stored.baselines[0].drivers.hosts).toBe(3);
  });
});
