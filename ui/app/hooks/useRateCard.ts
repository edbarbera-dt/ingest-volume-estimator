import { isListPrice, listPricesFor, mergeRateCard, type RateCard } from "../shared/rateCard";
import { usePersistedState } from "./usePersistedState";

export const RATE_CARD_KEY = "rate-card";

export function useRateCard() {
  const s = usePersistedState<RateCard>(RATE_CARD_KEY, mergeRateCard);
  return {
    ...s,
    card: s.value,
    isListPrice: isListPrice(s.value),
    reset: () => s.save(listPricesFor(s.value.currency)),
  };
}
