import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { AppRoot } from "@dynatrace/strato-components/core";

/** Renders inside Strato's AppRoot (theme + intl providers). */
export function renderWithRoot(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: ({ children }) => <AppRoot>{children}</AppRoot>, ...options });
}
