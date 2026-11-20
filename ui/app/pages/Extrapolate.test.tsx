import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
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
jest.mock("@dynatrace-sdk/user-preferences", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").userPreferencesMock());
jest.mock("@dynatrace/strato-components/forms", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").formsWithNativeSelect());

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

let execute: jest.Mock;
beforeEach(() => {
  execute = jest.fn().mockResolvedValue(undefined);
  (useDql as jest.Mock).mockImplementation(dqlMock("data"));
  (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The projected monthly total, parsed from the heading. */
const projectedCost = () => {
  const text = screen.getByText(/Projected monthly cost:/).textContent ?? "";
  return Number(text.replace(/[^0-9.]/g, ""));
};
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
/** Signal driver pickers, in SIGNALS order: logs, traces, metrics, events. */
const driverPicker = (i: number) => document.querySelectorAll("select")[i];
/** The last saved inputs, after the auto-save debounce. */
const lastSaved = () => {
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  const [{ key, body }] = execute.mock.calls[execute.mock.calls.length - 1] as [{ key: string; body: { value: string } }];
  expect(key).toBe("extrapolation-inputs");
  return JSON.parse(body.value) as ReturnType<typeof defaultInputs>;
};

describe("Extrapolate", () => {
  it("prefills production with current counts and projects a monthly cost", () => {
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

  it("scales the projection with production counts and the multiplier", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();
    expect(base).toBeGreaterThan(0);

    type("Production Hosts", "30");
    const moreHosts = projectedCost();
    expect(moreHosts).toBeGreaterThan(base);

    type("Multiplier", "2");
    expect(projectedCost()).toBeCloseTo(moreHosts * 2, 1);
  });

  it("applies a current driver override, and drops it when set back to the detected count", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();

    // Twice the hosts for the same volume halves the per-host rate, so host-driven cost falls.
    type("Current Hosts", "6");
    expect(projectedCost()).toBeLessThan(base);
    expect(lastSaved().driverOverrides).toEqual({ hosts: 6 });

    type("Current Hosts", "3");
    expect(projectedCost()).toBeCloseTo(base, 2);
    expect(lastSaved().driverOverrides).toEqual({});
  });

  it("does not save before the user changes anything", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("switches the driver a signal scales with", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    expect(driverPicker(0).value).toBe("hosts");
    expect(screen.queryByLabelText("Production K8s pods")).not.toBeInTheDocument();

    fireEvent.change(driverPicker(0), { target: { value: "pods" } });

    // No pods in the fixture tenant: logs can't be projected until a count is entered.
    expect(screen.getByLabelText("Production K8s pods")).toBeInTheDocument();
    expect(screen.getByText(/driver count of 0/)).toBeInTheDocument();
    expect(lastSaved().drivers.logs).toBe("pods");

    type("Current K8s pods", "10");
    expect(screen.queryByText(/driver count of 0/)).not.toBeInTheDocument();
  });

  it("saves edited retention days", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();
    type("Logs retention days", "365");
    expect(projectedCost()).toBeGreaterThan(base);
    expect(lastSaved().retentionDays.logs).toBe(365);
  });

  it("exports the projection as CSV", async () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    let blob: Blob | undefined;
    const createObjectURL = jest.fn((b: Blob) => {
      blob = b;
      return "blob:projection";
    });
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("ingest-volume-projection.csv");
      expect(this.href).toBe("blob:projection");
    });
    render();

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:projection");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob as Blob);
    });
    const lines = text.trim().split("\n");
    expect(lines[0]).toMatch(/^signal,unit,driver,current_per_day,current_driver_count,/);
    expect(lines).toHaveLength(1 + 4 + 1); // header, one row per signal, total
    expect(text).not.toMatch(/poc/i);
  });

  it("loads driver overrides saved by versions before 1.0.0", () => {
    const legacy = { ...defaultInputs(), prodCounts: { hosts: 30, services: 110, pods: 0, clusters: 0, containers: 0 }, pocOverrides: { hosts: 6 } };
    delete (legacy as Partial<typeof legacy>).driverOverrides;
    (useAppState as jest.Mock).mockImplementation(stateFor(legacy));
    render();
    expect(input("Current Hosts").value).toBe("6");
    expect(input("Production Hosts").value).toBe("30");
  });
});
