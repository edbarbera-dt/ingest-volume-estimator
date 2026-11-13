import {
  GIB,
  bytesToGiB,
  gibToBytes,
  toNumber,
  formatNumber,
  formatVolume,
  formatCurrency,
  formatPercent,
} from "./units";

describe("units", () => {
  it("converts bytes to GiB and back", () => {
    expect(GIB).toBe(1024 ** 3);
    expect(bytesToGiB(GIB * 2)).toBe(2);
    expect(gibToBytes(1.5)).toBe(GIB * 1.5);
  });

  it("treats invalid byte values as 0", () => {
    expect(bytesToGiB(NaN)).toBe(0);
    expect(bytesToGiB(-5)).toBe(0);
    expect(bytesToGiB(Infinity)).toBe(0);
  });

  it.each([
    ["42", 42],
    [42, 42],
    ["1.5e3", 1500],
    [null, 0],
    [undefined, 0],
    ["abc", 0],
    [{}, 0],
  ])("toNumber(%p) = %p", (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });

  it("formats numbers with compact suffixes", () => {
    expect(formatNumber(2_200_000)).toBe("2.2M");
    expect(formatNumber(950)).toBe("950");
    expect(formatNumber(NaN)).toBe("–");
  });

  it("formats volume by signal unit", () => {
    expect(formatVolume(4.9, "GiB")).toBe("4.9 GiB");
    expect(formatVolume(2_200_000, "data points")).toBe("2.2M data points");
    expect(formatVolume(0.0021, "GiB")).toBe("2.15 MiB");
  });

  it("formats currency", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCurrency(NaN, "USD")).toBe("–");
  });

  it("formats percentages", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(null)).toBe("–");
  });
});
