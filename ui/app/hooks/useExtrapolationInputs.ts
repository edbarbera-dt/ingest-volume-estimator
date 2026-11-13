import { parseInputs, type ExtrapolationInputs } from "../shared/inputs";
import { usePersistedState } from "./usePersistedState";

export const INPUTS_KEY = "extrapolation-inputs";

export function useExtrapolationInputs() {
  return usePersistedState<ExtrapolationInputs>(INPUTS_KEY, parseInputs);
}
