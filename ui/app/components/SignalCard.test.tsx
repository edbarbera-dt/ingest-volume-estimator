import React from "react";
import { screen } from "@testing-library/react";
import { renderWithRoot } from "../../test/render";
import { SignalCard } from "./SignalCard";

jest.mock("@dynatrace/strato-components/charts", () => jest.requireActual<typeof import("../../test/mocks")>("../../test/mocks").chartsMock());

const props = { signal: "logs" as const, volume: 70, perDay: 10, cost: 14, currency: "USD" };

describe("SignalCard", () => {
  it("shows volume, per-day volume and cost without a baseline", () => {
    renderWithRoot(<SignalCard {...props} change={null} />);
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText(/\/ day$/)).toBeInTheDocument();
    expect(screen.getByText(/^Est\. cost \$14/)).toBeInTheDocument();
    expect(screen.queryByText(/^Change/)).toBeNull();
    expect(screen.queryByText(/vs /)).toBeNull();
  });

  it("shows the change against a named baseline", () => {
    renderWithRoot(<SignalCard {...props} change={{ delta: 2, pct: 0.25 }} baselineLabel="Week 1" />);
    expect(screen.getByText("% per day vs Week 1")).toBeInTheDocument();
    expect(screen.getByText(/^Change \+?25/)).toBeInTheDocument();
  });

  it("falls back to 'baseline' when the baseline has no label", () => {
    renderWithRoot(<SignalCard {...props} change={{ delta: -1, pct: -0.1 }} />);
    expect(screen.getByText("% per day vs baseline")).toBeInTheDocument();
  });

  it("says when the baseline had none of this signal", () => {
    renderWithRoot(<SignalCard {...props} change={{ delta: 10, pct: null }} />);
    expect(screen.getByText(/baseline had no logs/)).toBeInTheDocument();
    expect(screen.queryByText(/^Change/)).toBeNull();
  });
});
