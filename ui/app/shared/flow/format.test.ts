import { formatRecordsRate, formatBytesRate, edgeLabel } from "./format";

describe("flow formatting", () => {
  it("formats rec/s", () => {
    expect(formatRecordsRate(14.78)).toBe("14.8 rec/s");
    expect(formatRecordsRate(1500)).toBe("1.5K rec/s");
    expect(formatRecordsRate(0)).toBe("0 rec/s");
    expect(formatRecordsRate(0.004)).toBe("<0.01 rec/s");
  });
  it("formats ~bytes/s with binary units", () => {
    expect(formatBytesRate(2786)).toBe("~2.72 KiB/s");
    expect(formatBytesRate(3 * 1024 ** 3)).toBe("~3 GiB/s");
    expect(formatBytesRate(10)).toBe("~10 B/s");
    expect(formatBytesRate(null)).toBe("–");
  });
  it("labels edges by mode and falls back to rec/s without a size", () => {
    expect(edgeLabel({ rate: 2, bytesRate: 2048 }, "bytes")).toBe("~2 KiB/s");
    expect(edgeLabel({ rate: 2, bytesRate: null }, "bytes")).toBe("2 rec/s");
    expect(edgeLabel({ rate: 2, bytesRate: 2048 }, "records")).toBe("2 rec/s");
  });
});
