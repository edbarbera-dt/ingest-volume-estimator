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
  it("seeds a Current environment unit that reproduces today's cost", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    expect(screen.getByText(/Projected monthly cost: \$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
    expect(screen.getByText("Hosts (detected 3)")).toBeInTheDocument();
    expect(input("Unit name").value).toBe("Current environment");
    expect(input("Current environment Hosts").value).toBe("3");
    expect(screen.getByText(/Current: \$[0-9.,]+ \/ month \(\+0%\)/)).toBeInTheDocument();
    expect(screen.getByText("3. Cost per driver")).toBeInTheDocument();
  });

  it("scales the projection with unit quantity, driver counts and traffic factor", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();
    expect(base).toBeGreaterThan(0);

    type("Current environment quantity", "3");
    expect(projectedCost()).toBeCloseTo(base * 3, 1);

    type("Current environment quantity", "1");
    type("Current environment traffic factor", "2");
    expect(projectedCost()).toBeCloseTo(base * 2, 1);

    type("Current environment traffic factor", "1");
    type("Current environment Hosts", "30");
    expect(projectedCost()).toBeGreaterThan(base);
  });

  it("adds, duplicates and removes units, and saves them", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();

    fireEvent.click(screen.getByRole("button", { name: /Duplicate Current environment/ }));
    expect(projectedCost()).toBeCloseTo(base * 2, 1);
    expect(lastSaved().units.map((u) => u.name)).toEqual(["Current environment", "Current environment (copy)"]);

    fireEvent.click(screen.getByRole("button", { name: /Remove Current environment \(copy\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Add unit$/ }));
    expect(projectedCost()).toBeCloseTo(base, 1);
    type("Unit 2 K8s clusters", "1");
    expect(lastSaved().units[1]).toMatchObject({ name: "Unit 2", counts: { clusters: 1 } });
  });

  it("warns when volume is attributed to a driver with no current count, until a count is set", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    type("Logs % from K8s pods", "50");
    expect(screen.getByText(/attributed to k8s pods, but the current count is 0/)).toBeInTheDocument();
    expect(lastSaved().attribution.logs).toEqual({ hosts: 100, pods: 50 });

    type("Current K8s pods", "10");
    expect(screen.queryByText(/current count is 0/)).not.toBeInTheDocument();
  });

  it("names missing scopes", () => {
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    (useDql as jest.Mock).mockImplementation(dqlMock("forbidden"));
    render();
    expect(screen.getAllByText(/storage:smartscape:read/).length).toBeGreaterThan(0);
  });

  it("applies a current driver override, and drops it when set back to the detected count", () => {
    jest.useFakeTimers();
    (useAppState as jest.Mock).mockImplementation(stateFor(undefined));
    render();
    const base = projectedCost();

    // Twice the hosts for the same volume halves the per-host cost; the unit still has 3 hosts.
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
    expect(text).toMatch(/^signal,unit,current_per_day,/);
    expect(text).toContain("\ncost_unit,quantity,traffic_factor,");
    expect(text).toContain("Current environment,1,1,3,");
    expect(text).not.toMatch(/poc/i);
  });

  it("migrates inputs saved by earlier versions into a Production unit", () => {
    const legacy = {
      drivers: { logs: "hosts", traces: "services", metrics: "hosts", events: "hosts" },
      prodCounts: { hosts: 30, services: 110, pods: 0, clusters: 0, containers: 0 },
      pocOverrides: { hosts: 6 },
      multiplier: 1.3,
      retentionDays: { logs: 35, traces: 10, metrics: 462, events: 35 },
    };
    (useAppState as jest.Mock).mockImplementation(stateFor(legacy));
    render();
    expect(input("Current Hosts").value).toBe("6");
    expect(input("Unit name").value).toBe("Production");
    expect(input("Production Hosts").value).toBe("30");
    expect(input("Production traffic factor").value).toBe("1.3");
  });
});
