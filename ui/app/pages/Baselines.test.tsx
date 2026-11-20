import React from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
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
jest.mock("@dynatrace/strato-components/forms", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").formsWithNativeSelect());
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
    fireEvent.change(screen.getByPlaceholderText(/Week 1/), { target: { value: "Before filters" } });
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

  describe("with saved baselines", () => {
    const tf = { start: "2026-11-01T00:00:00.000Z", end: "2026-11-08T00:00:00.000Z", days: 7 };
    const drivers = { hosts: 3, services: 11, pods: 0, clusters: 0, containers: 15 };
    const make = (id: string, label: string, logs: number, createdAt: string) => ({
      id,
      label,
      createdAt,
      timeframe: tf,
      volumePerDay: { logs, traces: 2, metrics: 1000, events: 0 },
      drivers,
    });
    // Newest first, as addBaseline stores them.
    const after = make("b2", "After filters", 5, "2026-11-15T00:00:00.000Z");
    const middle = make("b1", "Middle", 8, "2026-11-10T00:00:00.000Z");
    const before = make("b0", "Before filters", 10, "2026-11-08T00:00:00.000Z");

    let execute: jest.Mock;
    const withStore = (store: unknown) =>
      (useAppState as jest.Mock).mockReturnValue({ data: { value: JSON.stringify(store) }, isError: false, isLoading: false });
    const saved = () => {
      const [{ key, body }] = execute.mock.calls[execute.mock.calls.length - 1] as [{ key: string; body: { value: string } }];
      expect(key).toBe("baselines");
      return JSON.parse(body.value) as { baselines: { id: string }[]; activeId: string | null };
    };
    const rowOf = (label: string) => screen.getAllByText(label)[0].closest("[role='row']") as HTMLElement;
    const pickers = () => document.querySelectorAll("select");

    // DataTable virtualises its rows from the scroll container's client size, which is 0 in jsdom.
    beforeAll(() => {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
    });
    afterAll(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
    });
    beforeEach(() => {
      execute = jest.fn().mockResolvedValue(undefined);
      (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false });
    });

    it("lists each snapshot with its per-day volume", () => {
      withStore({ baselines: [after, before], activeId: null });
      render();
      expect(screen.queryByText("No baselines yet")).not.toBeInTheDocument();
      expect(rowOf("After filters")).toHaveTextContent("5 GiB");
      expect(rowOf("After filters")).toHaveTextContent("Set active");
      expect(rowOf("Before filters")).toHaveTextContent("10 GiB");
      expect(rowOf("Before filters")).toHaveTextContent("Delete");
      expect(screen.queryByText("active")).not.toBeInTheDocument();
    });

    it("sets a snapshot active, then unsets it", async () => {
      withStore({ baselines: [after, before], activeId: null });
      const { unmount } = render();
      await act(async () => {
        fireEvent.click(within(rowOf("Before filters")).getByRole("button", { name: "Set active" }));
      });
      expect(saved().activeId).toBe("b0");
      unmount();

      withStore({ baselines: [after, before], activeId: "b0" });
      render();
      expect(within(rowOf("Before filters")).getByText("active")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(within(rowOf("Before filters")).getByRole("button", { name: "Unset active" }));
      });
      expect(saved().activeId).toBeNull();
    });

    it("deletes a snapshot and clears it as active", async () => {
      withStore({ baselines: [after, before], activeId: "b0" });
      render();
      await act(async () => {
        fireEvent.click(within(rowOf("Before filters")).getByRole("button", { name: "Delete" }));
      });
      expect(saved()).toEqual({ baselines: [expect.objectContaining({ id: "b2" })], activeId: null });
      // The deleted row is gone from the table straight away.
      expect(screen.queryByText("Before filters")).not.toBeInTheDocument();
    });

    it("compares the oldest and newest snapshots by default", () => {
      withStore({ baselines: [after, before], activeId: null });
      render();
      expect(screen.getByText("Compare")).toBeInTheDocument();
      expect(pickers()[0].value).toBe("b0");
      expect(pickers()[1].value).toBe("b2");
      expect(screen.getByText("Before filters / day")).toBeInTheDocument();
      expect(screen.getByText("After filters / day")).toBeInTheDocument();
      const logs = screen.getAllByRole("row").find((r) => within(r).queryByText("Logs") && r.textContent?.includes("%"));
      expect(logs).toHaveTextContent("-50.0%");
      // Events were 0 in both snapshots, so no % change and no bar.
      expect(screen.getByTestId("bars")).toHaveTextContent("Logs,Traces,Metrics");
    });

    it("compares any two snapshots the user picks", () => {
      withStore({ baselines: [after, middle, before], activeId: null });
      render();
      fireEvent.change(pickers()[1], { target: { value: "b1" } });
      expect(screen.getByText("Middle / day")).toBeInTheDocument();
      const logs = screen.getAllByRole("row").find((r) => within(r).queryByText("Logs") && r.textContent?.includes("%"));
      expect(logs).toHaveTextContent("-20.0%");
    });

    it("hides the comparison with a single snapshot", () => {
      withStore({ baselines: [after], activeId: null });
      render();
      expect(screen.getByText("After filters")).toBeInTheDocument();
      expect(screen.queryByText("Compare")).not.toBeInTheDocument();
    });
  });
});
