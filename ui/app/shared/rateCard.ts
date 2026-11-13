import { SIGNALS, type Signal } from "./signals";
import { isNonNegative, isObject, parseJson } from "./parsing";

export interface Currency {
  label: string;
  /** Units of this currency per 1 USD. */
  perUsd: number;
}

/**
 * Local currencies Dynatrace bills in, with the rate it applies to USD list prices.
 * Source: https://www.dynatrace.com/pricing/currency-conversion/ (read 2026-11-13; the page
 * gives no effective date and no ISO codes; the codes below are ours).
 */
export const CURRENCIES = {
  USD: { label: "US Dollar", perUsd: 1 },
  AUD: { label: "Australian Dollar", perUsd: 1.45869 },
  BRL: { label: "Brazilian Real", perUsd: 5.2521 },
  CAD: { label: "Canadian Dollar", perUsd: 1.39424 },
  CNY: { label: "Chinese Renminbi", perUsd: 6.90899 },
  DKK: { label: "Danish Krone", perUsd: 6.51469 },
  EUR: { label: "Euro", perUsd: 0.87198 },
  HKD: { label: "Hong Kong Dollar", perUsd: 7.83967 },
  INR: { label: "Indian Rupee", perUsd: 93.99176 },
  IDR: { label: "Indonesian Rupiah", perUsd: 17038.6778 },
  JPY: { label: "Japanese Yen", perUsd: 159.65107 },
  MYR: { label: "Malaysian Ringgit", perUsd: 4.049 },
  MXN: { label: "Mexican Peso", perUsd: 18.0853 },
  NZD: { label: "New Zealand Dollar", perUsd: 1.75218 },
  NOK: { label: "Norwegian Krone", perUsd: 9.78316 },
  PLN: { label: "Polish Zloty", perUsd: 3.7418 },
  SGD: { label: "Singapore Dollar", perUsd: 1.2906 },
  KRW: { label: "South Korean Won", perUsd: 1530.8075 },
  SEK: { label: "Swedish Krona", perUsd: 9.5567 },
  CHF: { label: "Swiss Franc", perUsd: 0.80047 },
  GBP: { label: "United Kingdom Pound", perUsd: 0.75677 },
} as const satisfies Record<string, Currency>;

export type CurrencyCode = keyof typeof CURRENCIES;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export interface SignalRates {
  /** Per GiB for logs/traces/events, per 100,000 data points for metrics. */
  ingestPrice: number;
  /** Per GiB-day stored beyond the included days. Null when Retain is not billed per GiB-day. */
  retainPricePerGiBDay: number | null;
  includedRetentionDays: number;
}

export interface RateCard {
  currency: CurrencyCode;
  rates: Record<Signal, SignalRates>;
}

export type RateField = keyof SignalRates;
export const PRICE_FIELDS: readonly RateField[] = ["ingestPrice", "retainPricePerGiBDay"];

/**
 * Dynatrace Platform Subscription list prices, USD.
 * Source: https://www.dynatrace.com/pricing/rate-card/ ("List Price (USD)") and
 * https://www.dynatrace.com/pricing/ for included retention, both read 2026-11-13.
 * The rate card shows no regional, cloud or edition variation; contracts may be discounted.
 *
 * - Log Management & Analytics: Ingest & Process $0.20/GiB; Retain $0.0007/GiB-day.
 *   Pay-per-Query model: no included retention. (The Bundled Queries model, "Retain with
 *   Included Queries" at $0.02/GiB-day, is not the default; enter it in Settings if it applies.)
 * - Traces: Ingest & Process $0.20/GiB; Retain $0.0007/GiB-day; "10 days of retention included".
 *   Full-Stack Monitoring includes a trace allowance (size not published), so traces from
 *   Full-Stack hosts may cost less than shown.
 * - Metrics: Ingest & Process $0.15 per 100k data points; "15 months of retention ... included",
 *   so no Retain cost is modelled (retainPricePerGiBDay = null).
 * - Events: Ingest & Process $0.20/GiB; Retain $0.0007/GiB-day. Included retention is not
 *   published, so it defaults to 0 days (conservative).
 */
export const LIST_PRICES: RateCard = {
  currency: "USD",
  rates: {
    logs: { ingestPrice: 0.2, retainPricePerGiBDay: 0.0007, includedRetentionDays: 0 },
    traces: { ingestPrice: 0.2, retainPricePerGiBDay: 0.0007, includedRetentionDays: 10 },
    metrics: { ingestPrice: 0.15, retainPricePerGiBDay: null, includedRetentionDays: 457 },
    events: { ingestPrice: 0.2, retainPricePerGiBDay: 0.0007, includedRetentionDays: 0 },
  },
};

/** Converts every price in the card to `to`; retention days are unchanged. */
export function convertRateCard(card: RateCard, to: CurrencyCode): RateCard {
  const factor = CURRENCIES[to].perUsd / CURRENCIES[card.currency].perUsd;
  const rates = {} as Record<Signal, SignalRates>;
  for (const s of SIGNALS) {
    const r = card.rates[s];
    rates[s] = {
      ingestPrice: r.ingestPrice * factor,
      retainPricePerGiBDay:
        r.retainPricePerGiBDay === null ? null : r.retainPricePerGiBDay * factor,
      includedRetentionDays: r.includedRetentionDays,
    };
  }
  return { currency: to, rates };
}

export function listPricesFor(currency: CurrencyCode): RateCard {
  return convertRateCard(LIST_PRICES, currency);
}

/**
 * Reads a stored rate card (JSON string or object). Anything missing, corrupt, negative or
 * non-finite falls back to the list price in the stored currency (USD if unknown).
 */
export function mergeRateCard(stored: unknown): RateCard {
  const parsed = parseJson(stored);
  if (!isObject(parsed)) return listPricesFor("USD");

  const currency = isCurrencyCode(parsed.currency) ? parsed.currency : "USD";
  const base = listPricesFor(currency);
  const storedRates = isObject(parsed.rates) ? parsed.rates : {};

  const rates = {} as Record<Signal, SignalRates>;
  for (const s of SIGNALS) {
    const fallback = base.rates[s];
    const r = isObject(storedRates[s]) ? storedRates[s] : {};
    rates[s] = {
      ingestPrice: isNonNegative(r.ingestPrice) ? r.ingestPrice : fallback.ingestPrice,
      retainPricePerGiBDay:
        fallback.retainPricePerGiBDay === null
          ? null
          : isNonNegative(r.retainPricePerGiBDay)
            ? r.retainPricePerGiBDay
            : fallback.retainPricePerGiBDay,
      includedRetentionDays: isNonNegative(r.includedRetentionDays)
        ? r.includedRetentionDays
        : fallback.includedRetentionDays,
    };
  }
  return { currency, rates };
}

const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/** True while every value equals the list price in the card's currency. */
export function isListPrice(card: RateCard): boolean {
  const list = listPricesFor(card.currency);
  return SIGNALS.every((s) =>
    (Object.keys(list.rates[s]) as RateField[]).every((f) =>
      close(card.rates[s][f], list.rates[s][f]),
    ),
  );
}

/** Price per single unit of the signal's volume (per GiB, or per data point for metrics). */
export function ingestPricePerUnit(card: RateCard, signal: Signal): number {
  const price = card.rates[signal].ingestPrice;
  return signal === "metrics" ? price / 100_000 : price;
}

export interface RateCardError {
  signal: Signal;
  field: RateField;
  message: string;
}

export function validateRateCard(card: RateCard): RateCardError[] {
  const errors: RateCardError[] = [];
  for (const s of SIGNALS) {
    for (const f of Object.keys(card.rates[s]) as RateField[]) {
      const v = card.rates[s][f];
      if (v === null) continue;
      if (!isNonNegative(v)) {
        errors.push({ signal: s, field: f, message: "Must be a non-negative number" });
      }
    }
  }
  return errors;
}
