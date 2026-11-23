import React from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useAppState, useDql, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { App } from "./App";
import { NAV_ITEMS } from "./components/Header";
import { renderWithRoot } from "../test/render";
import { dqlMock } from "../test/mocks";
import { clearTopologyCache } from "./hooks/useFlowTopology";

jest.mock("@dynatrace-sdk/react-hooks", () => ({ useDql: jest.fn(), useAppState: jest.fn(), useSetAppState: jest.fn() }));
jest.mock("@dynatrace-sdk/client-classic-environment-v2", () => ({ settingsObjectsClient: { getSettingsObjects: jest.fn() } }));
jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../test/mocks")>("../test/mocks").chartsMock());

const SUBTITLES: Record<string, RegExp> = {
  "/": /Estimated cost for this timeframe/,
  "/signals": /Top contributors per signal/,
  "/extrapolate": /scale units of them up or down/,
  "/baselines": /Save snapshots of ingest and drivers/,
  "/flow": /OpenPipeline: sources → pipelines → destinations/,
  "/settings": /Rate card used for every cost estimate/,
};

const render = async (path: string) => {
  renderWithRoot(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  clearTopologyCache();
  (useAppState as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: false });
  (useSetAppState as jest.Mock).mockReturnValue({ execute: jest.fn().mockResolvedValue(undefined), isLoading: false });
  (useDql as jest.Mock).mockImplementation(dqlMock("data"));
  (settingsObjectsClient.getSettingsObjects as jest.Mock).mockResolvedValue({ items: [] });
});

describe("App routing", () => {
  it.each(NAV_ITEMS.map((n) => [n.path, n.label]))("renders the %s route (%s)", async (path) => {
    await render(path);
    expect(screen.getByText(SUBTITLES[path])).toBeInTheDocument();
  });

  it("redirects an unknown route to the Overview", async () => {
    await render("/does-not-exist");
    expect(screen.getByText(SUBTITLES["/"])).toBeInTheDocument();
  });

  it("shows the app name and every nav item in the header", async () => {
    await render("/");
    expect(screen.getAllByText("Ingest Volume Estimator").length).toBeGreaterThan(0);
    for (const item of NAV_ITEMS) expect(screen.getAllByRole("link", { name: item.label }).length).toBeGreaterThan(0);
  });

  it("navigates when a header item is clicked and marks it selected", async () => {
    await render("/");
    const settingsLink = screen.getAllByRole("link", { name: "Settings" })[0];
    await act(async () => {
      fireEvent.click(settingsLink);
      await Promise.resolve();
    });
    expect(screen.getByText(SUBTITLES["/settings"])).toBeInTheDocument();
    expect(within(document.body).queryByText(SUBTITLES["/"])).toBeNull();
    // Strato marks the selected item with an extra (hashed) class only.
    const classes = (label: string) => new Set(screen.getAllByRole("link", { name: label })[0].classList);
    const selectedOnly = [...classes("Settings")].filter((c) => !classes("Overview").has(c));
    expect(selectedOnly.length).toBeGreaterThan(0);
    expect([...classes("Signals")].some((c) => selectedOnly.includes(c))).toBe(false);
  });
});
