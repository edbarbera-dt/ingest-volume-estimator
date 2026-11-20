import React from "react";
import { screen } from "@testing-library/react";
import { renderWithRoot } from "../../test/render";
import { AppShell } from "./AppShell";
import { TimeframeProvider } from "../context/Timeframe";

const render = (ui: React.ReactElement) => renderWithRoot(<TimeframeProvider>{ui}</TimeframeProvider>);

describe("AppShell", () => {
  it("renders title, subtitle, actions, timeframe selector and content", () => {
    render(
      <AppShell title="Page" subtitle="Sub" actions={<button>Act</button>}>
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.getByText("Page")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Timeframe").length).toBeGreaterThan(0);
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("hides the timeframe selector when asked", () => {
    render(
      <AppShell title="Settings" showTimeframe={false}>
        <p>Body</p>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Timeframe")).toBeNull();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});
