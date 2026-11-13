import { PageLayout } from "@dynatrace/strato-components/layouts";
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { TimeframeProvider } from "./context/Timeframe";
import { Overview } from "./pages/Overview";
import { Signals } from "./pages/Signals";
import { Extrapolate } from "./pages/Extrapolate";
import { Baselines } from "./pages/Baselines";
import { Settings } from "./pages/Settings";
import { Flow } from "./pages/Flow";

export const App = () => {
  return (
    <TimeframeProvider>
      <PageLayout>
        <PageLayout.Header>
          <Header />
        </PageLayout.Header>
        <PageLayout.Content>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/extrapolate" element={<Extrapolate />} />
            <Route path="/baselines" element={<Baselines />} />
            <Route path="/flow" element={<Flow />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageLayout.Content>
      </PageLayout>
    </TimeframeProvider>
  );
};
