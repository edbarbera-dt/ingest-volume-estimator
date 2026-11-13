import { useCallback, useMemo, useState } from "react";
import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { isNotFound } from "@dynatrace-sdk/client-state";

export interface PersistedState<T> {
  value: T;
  isLoading: boolean;
  /** Load error other than "not saved yet". */
  error: Error | null;
  save: (value: T) => Promise<void>;
  isSaving: boolean;
  saveError: Error | null;
}

/**
 * App state (shared by all users of the app on this tenant), stored as JSON under `key`.
 * A missing key is not an error: `parse(undefined)` supplies the default.
 */
export function usePersistedState<T>(key: string, parse: (raw: unknown) => T): PersistedState<T> {
  const state = useAppState({ key });
  const setter = useSetAppState();
  const [local, setLocal] = useState<{ value: T } | null>(null);

  const notFound =
    state.isError && (isNotFound(state.error) || state.errorDetails?.code === 404);

  const stored = useMemo(
    () => parse(notFound ? undefined : state.data?.value),
    [parse, notFound, state.data],
  );

  const save = useCallback(
    async (value: T) => {
      setLocal({ value });
      await setter.execute({ key, body: { value: JSON.stringify(value) } });
    },
    [key, setter],
  );

  return {
    value: local ? local.value : stored,
    isLoading: state.isLoading && !local,
    error: state.isError && !notFound ? (state.error ?? null) : null,
    save,
    isSaving: setter.isLoading,
    saveError: setter.error ?? null,
  };
}
