import {
  LIST_PRICES,
  CURRENCIES,
  listPricesFor,
  convertRateCard,
  mergeRateCard,
  isListPrice,
  ingestPricePerUnit,
  validateRateCard,
} from "./rateCard";

describe("LIST_PRICES", () => {
  it("is in USD and covers every signal", () => {
    expect(LIST_PRICES.currency).toBe("USD");
    expect(Object.keys(LIST_PRICES.rates).sort()).toEqual(
      ["events", "logs", "metrics", "traces"],
    );
  });
  it("has non-negative prices", () => {
    expect(validateRateCard(LIST_PRICES)).toEqual([]);
  });
});

describe("mergeRateCard", () => {
  it("returns list prices for missing input", () => {
    expect(mergeRateCard(undefined)).toEqual(LIST_PRICES);
    expect(mergeRateCard(null)).toEqual(LIST_PRICES);
    expect(mergeRateCard("")).toEqual(LIST_PRICES);
  });
  it("returns list prices for corrupt JSON", () => {
    expect(mergeRateCard("{not json")).toEqual(LIST_PRICES);
    expect(mergeRateCard("42")).toEqual(LIST_PRICES);
    expect(mergeRateCard("[]")).toEqual(LIST_PRICES);
  });
  it("keeps valid overrides and falls back per field", () => {
    const stored = JSON.stringify({
      currency: "USD",
      rates: { logs: { ingestPrice: 0.1, includedRetentionDays: "x" } },
    });
    const card = mergeRateCard(stored);
    expect(card.rates.logs.ingestPrice).toBe(0.1);
    expect(card.rates.logs.includedRetentionDays).toBe(
      LIST_PRICES.rates.logs.includedRetentionDays,
    );
    expect(card.rates.traces).toEqual(LIST_PRICES.rates.traces);
  });
  it("rejects negative and non-finite numbers", () => {
    const card = mergeRateCard({
      rates: { logs: { ingestPrice: -1 }, events: { ingestPrice: Infinity } },
    });
    expect(card.rates.logs.ingestPrice).toBe(LIST_PRICES.rates.logs.ingestPrice);
    expect(card.rates.events.ingestPrice).toBe(LIST_PRICES.rates.events.ingestPrice);
  });
  it("falls back to USD list prices for an unknown currency", () => {
    expect(mergeRateCard({ currency: "XYZ" }).currency).toBe("USD");
  });
});

describe("isListPrice", () => {
  it("is true for list prices in any currency", () => {
    expect(isListPrice(LIST_PRICES)).toBe(true);
  });
  it("is false once a price is edited", () => {
    const card = mergeRateCard({ rates: { logs: { ingestPrice: 0.1 } } });
    expect(isListPrice(card)).toBe(false);
  });
});

describe("ingestPricePerUnit", () => {
  it("is the GiB price for byte signals", () => {
    expect(ingestPricePerUnit(LIST_PRICES, "logs")).toBe(
      LIST_PRICES.rates.logs.ingestPrice,
    );
  });
  it("divides the per-100k price for metrics", () => {
    expect(ingestPricePerUnit(LIST_PRICES, "metrics")).toBeCloseTo(
      LIST_PRICES.rates.metrics.ingestPrice / 100_000,
    );
  });
});

describe("validateRateCard", () => {
  it("reports negative values", () => {
    const bad = JSON.parse(JSON.stringify(LIST_PRICES)) as typeof LIST_PRICES;
    bad.rates.logs.ingestPrice = -1;
    expect(validateRateCard(bad)).toEqual([
      { signal: "logs", field: "ingestPrice", message: "Must be a non-negative number" },
    ]);
  });
});

describe("list price defaults (rate card 2026-11-13)", () => {
  it("matches the public USD rate card", () => {
    expect(LIST_PRICES.rates.logs).toEqual({
      ingestPrice: 0.2,
      retainPricePerGiBDay: 0.0007,
      includedRetentionDays: 0,
    });
    expect(LIST_PRICES.rates.traces).toEqual({
      ingestPrice: 0.2,
      retainPricePerGiBDay: 0.0007,
      includedRetentionDays: 10,
    });
    expect(LIST_PRICES.rates.metrics.ingestPrice).toBe(0.15);
    expect(LIST_PRICES.rates.metrics.retainPricePerGiBDay).toBeNull();
    expect(LIST_PRICES.rates.events.ingestPrice).toBe(0.2);
    expect(LIST_PRICES.rates.events.retainPricePerGiBDay).toBe(0.0007);
  });
});

describe("currencies", () => {
  it("lists the 20 local currencies plus USD", () => {
    expect(Object.keys(CURRENCIES)).toHaveLength(21);
    expect(CURRENCIES.EUR.perUsd).toBe(0.87198);
  });

  it("uses list prices of the stored currency as the fallback", () => {
    expect(mergeRateCard({ currency: "EUR" })).toEqual(listPricesFor("EUR"));
  });

  it("treats converted list prices as list prices", () => {
    expect(isListPrice(listPricesFor("EUR"))).toBe(true);
  });

  it("converts prices by the currency ratio", () => {
    const eur = convertRateCard(LIST_PRICES, "EUR");
    expect(eur.currency).toBe("EUR");
    expect(eur.rates.logs.ingestPrice).toBeCloseTo(0.2 * 0.87198);
    expect(eur.rates.logs.includedRetentionDays).toBe(0);
  });

  it("round-trips", () => {
    const back = convertRateCard(convertRateCard(LIST_PRICES, "GBP"), "USD");
    expect(back.rates.metrics.ingestPrice).toBeCloseTo(0.15);
  });
});
