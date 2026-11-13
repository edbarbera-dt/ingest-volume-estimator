import {
  addBaseline,
  parseBaselineStore,
  removeBaseline,
  setActiveBaseline,
  type Baseline,
  type BaselineStore,
} from "../shared/baselines";
import { usePersistedState } from "./usePersistedState";

export const BASELINES_KEY = "baselines";

export function useBaselines() {
  const s = usePersistedState<BaselineStore>(BASELINES_KEY, parseBaselineStore);
  const store = s.value;
  return {
    ...s,
    baselines: store.baselines,
    active: store.baselines.find((b) => b.id === store.activeId) ?? null,
    add: (b: Baseline) => s.save(addBaseline(store, b)),
    remove: (id: string) => s.save(removeBaseline(store, id)),
    setActive: (id: string | null) => s.save(setActiveBaseline(store, id)),
  };
}
