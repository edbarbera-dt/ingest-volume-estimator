import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithRoot as render } from "../../test/render";
import { QueryState } from "./QueryState";

describe("QueryState", () => {
  it("shows a loading indicator", () => {
    render(<QueryState isLoading error={null}>content</QueryState>);
    expect(screen.getByTestId("query-loading")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("shows an error with retry", () => {
    const retry = jest.fn();
    render(
      <QueryState isLoading={false} error={new Error("budget exceeded")} onRetry={retry}>
        content
      </QueryState>,
    );
    expect(screen.getByText("budget exceeded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });

  it("names the missing scope for permission errors", () => {
    render(
      <QueryState isLoading={false} error={new Error("Forbidden")} scopes={["storage:system:read"]}>
        content
      </QueryState>,
    );
    expect(screen.getAllByText(/storage:system:read/).length).toBeGreaterThan(0);
  });

  it("shows the empty state", () => {
    render(
      <QueryState isLoading={false} error={null} isEmpty emptyTitle="No billing data yet">
        content
      </QueryState>,
    );
    expect(screen.getByText("No billing data yet")).toBeInTheDocument();
  });

  it("renders children otherwise", () => {
    render(<QueryState isLoading={false} error={null}>content</QueryState>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
