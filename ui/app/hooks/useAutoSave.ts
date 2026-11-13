import { useEffect, useRef } from "react";

/** Calls `save(value)` `delayMs` after the last change. Skips the first value it sees. */
export function useAutoSave<T>(value: T | null, save: (v: T) => Promise<void>, delayMs = 800): void {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (value === null) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      void saveRef.current(value);
    }, delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
}
