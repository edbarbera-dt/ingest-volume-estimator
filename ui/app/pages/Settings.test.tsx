import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Settings } from "./Settings";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { LIST_PRICES } from "../shared/rateCard";

jest.mock("@dynatrace-sdk/react-hooks", () => ({
  useDql: jest.fn(),
  useAppState: jest.fn(),
  useSetAppState: jest.fn(),
}));

const render = () =>
  renderWithRoot(
    <MemoryRouter>
      <TimeframeProvider>
        <Settings />
      </TimeframeProvider>
    </MemoryRouter>,
  );

const isDisabled = (el: HTMLElement) => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";

describe("Settings", () => {
  it("falls back to list prices for corrupt state", () => {
    (useAppState as jest.Mock).mockReturnValue({ data: { value: "{corrupt" }, isError: false, isLoading: false });
    (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn(), isLoading: false });
    render();
    expect(screen.getByText("estimate, list price")).toBeInTheDocument();
    expect(isDisabled(screen.getByRole("button", { name: "Reset to list" }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Save rate card" }))).toBe(true);
  });

  it("resets an edited card to list prices and saves it", async () => {
    const edited = { ...LIST_PRICES, rates: { ...LIST_PRICES.rates, logs: { ...LIST_PRICES.rates.logs, ingestPrice: 0.1 } } };
    (useAppState as jest.Mock).mockReturnValue({ data: { value: JSON.stringify(edited) }, isError: false, isLoading: false });
    const execute = jest.fn().mockResolvedValue(undefined);
    (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false });
    render();
    expect(screen.getByText("estimate, custom rate card")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset to list" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save rate card" }));
    });
    expect(execute).toHaveBeenCalledWith({ key: "rate-card", body: { value: JSON.stringify(LIST_PRICES) } });
  });
});
