import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  DEFAULT_TIMEFRAME,
  resolveTimeframe,
  type ResolvedTimeframe,
  type TimeframeInput,
} from "../shared/timeframe";

interface TimeframeContextValue extends ResolvedTimeframe {
  /** The value shown in the TimeframeSelector. */
  value: TimeframeInput;
  setValue: (value: TimeframeInput | null) => void;
}

const TimeframeContext = createContext<TimeframeContextValue | null>(null);

export const TimeframeProvider = ({
  children,
  initial = DEFAULT_TIMEFRAME,
}: {
  children: React.ReactNode;
  initial?: TimeframeInput;
}) => {
  const [value, setRaw] = useState<TimeframeInput>(initial);
  // Resolve once per change so relative expressions don't drift on every render.
  const [resolved, setResolved] = useState<ResolvedTimeframe>(() => resolveTimeframe(initial));

  const setValue = useCallback((next: TimeframeInput | null) => {
    const v = next ?? DEFAULT_TIMEFRAME;
    setRaw(v);
    setResolved(resolveTimeframe(v));
  }, []);

  const ctx = useMemo(() => ({ ...resolved, value, setValue }), [resolved, value, setValue]);
  return <TimeframeContext.Provider value={ctx}>{children}</TimeframeContext.Provider>;
};

export function useTimeframe(): TimeframeContextValue {
  const ctx = useContext(TimeframeContext);
  if (!ctx) throw new Error("useTimeframe must be used inside TimeframeProvider");
  return ctx;
}
