import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";

export const NAV_ITEMS = [
  { path: "/", label: "Overview" },
  { path: "/signals", label: "Signals" },
  { path: "/extrapolate", label: "Extrapolate" },
  { path: "/baselines", label: "Baselines" },
  { path: "/flow", label: "Flow" },
  { path: "/settings", label: "Settings" },
] as const;

export const Header = () => {
  const { pathname } = useLocation();
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" appName="Ingest Volume Estimator" />
        {NAV_ITEMS.map((item) => (
          <AppHeader.NavigationItem
            key={item.path}
            as={Link}
            to={item.path}
            isSelected={item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)}
          >
            {item.label}
          </AppHeader.NavigationItem>
        ))}
      </AppHeader.Navigation>
    </AppHeader>
  );
};
