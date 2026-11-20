import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { Settings } from "./Settings";
import { TimeframeProvider } from "../context/Timeframe";
import { renderWithRoot } from "../../test/render";
import { LIST_PRICES, listPricesFor, type RateCard } from "../shared/rateCard";

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

  describe("editing the rate card", () => {
    let execute: jest.Mock;
    // The rate inputs live in a DataTable, which virtualises rows from the container's client size (0 in jsdom).
    beforeAll(() => {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
    });
    afterAll(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
    });
    beforeEach(() => {
      (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
      execute = jest.fn().mockResolvedValue(undefined);
      (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false });
    });
    const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    const saveButton = () => screen.getByRole("button", { name: "Save rate card" });
    const savedCard = () => {
      const [{ key, body }] = execute.mock.calls[execute.mock.calls.length - 1] as [{ key: string; body: { value: string } }];
      expect(key).toBe("rate-card");
      return JSON.parse(body.value) as RateCard;
    };

    it("shows list prices, and metrics retain as not billed separately", () => {
      render();
      expect(field("Logs Ingest & Process").value).toBe(String(LIST_PRICES.rates.logs.ingestPrice));
      expect(field("Traces Included retention (days)").value).toBe("10");
      expect(screen.getByText(/Not billed separately/)).toBeInTheDocument();
      expect(screen.queryByLabelText("Metrics Retain per GiB-day")).not.toBeInTheDocument();
    });

    it("saves an edited contract price", async () => {
      render();
      expect(isDisabled(saveButton())).toBe(true);
      fireEvent.change(field("Logs Ingest & Process"), { target: { value: "0.15" } });
      fireEvent.change(field("Events Included retention (days)"), { target: { value: "35" } });
      expect(isDisabled(saveButton())).toBe(false);
      expect(isDisabled(screen.getByRole("button", { name: "Reset to list" }))).toBe(false);

      await act(async () => {
        fireEvent.click(saveButton());
      });
      const card = savedCard();
      expect(card.rates.logs.ingestPrice).toBe(0.15);
      expect(card.rates.events.includedRetentionDays).toBe(35);
      expect(card.rates.traces).toEqual(LIST_PRICES.rates.traces);
    });

    it("blocks saving while a value is empty", () => {
      render();
      fireEvent.change(field("Traces Retain per GiB-day"), { target: { value: "" } });
      expect(screen.getByText("Fix these values before saving")).toBeInTheDocument();
      expect(screen.getByText(/Traces Retain per GiB-day: Must be a non-negative number/)).toBeInTheDocument();
      expect(isDisabled(saveButton())).toBe(true);

      fireEvent.change(field("Traces Retain per GiB-day"), { target: { value: "0.001" } });
      expect(screen.queryByText("Fix these values before saving")).not.toBeInTheDocument();
      expect(isDisabled(saveButton())).toBe(false);
    });

    it("converts prices when the currency changes and saves them", async () => {
      render();
      const currency = document.querySelector("select") as HTMLSelectElement;
      expect(currency.value).toBe("USD");
      fireEvent.change(currency, { target: { value: "EUR" } });

      expect(screen.getByText("Ingest & Process (EUR)")).toBeInTheDocument();
      expect(Number(field("Logs Ingest & Process").value)).toBeCloseTo(listPricesFor("EUR").rates.logs.ingestPrice, 4);
      // Converted list prices are still list prices.
      expect(isDisabled(screen.getByRole("button", { name: "Reset to list" }))).toBe(true);

      await act(async () => {
        fireEvent.click(saveButton());
      });
      const card = savedCard();
      expect(card.currency).toBe("EUR");
      expect(card.rates.logs.ingestPrice).toBeCloseTo(listPricesFor("EUR").rates.logs.ingestPrice, 6);
    });

    it("shows a save error", () => {
      (useSetAppState as jest.Mock).mockReturnValue({ execute, isLoading: false, error: new Error("Forbidden") });
      render();
      expect(screen.getByText("Could not save: Forbidden")).toBeInTheDocument();
    });
  });
});
