import { describe, expect, it } from "vitest";
import { fromUsd6, leverageToX10, sideToInt8, toPrice1e18, toUsd6, usdFromNumber } from "../src/units";

describe("units", () => {
  it("usd6 round-trips", () => {
    expect(toUsd6("12.5")).toBe(12_500_000n);
    expect(toUsd6("-0.000001")).toBe(-1n);
    expect(fromUsd6(12_500_000n)).toBe("12.5");
    expect(fromUsd6(-1n)).toBe("-0.000001");
    expect(fromUsd6(25_000_000n)).toBe("25");
    expect(() => toUsd6("1.0000001")).toThrow();
    expect(usdFromNumber(1.23456789)).toBe("1.234567");
  });
  it("prices and leverage", () => {
    expect(toPrice1e18("2.4315")).toBe(2_431_500_000_000_000_000n);
    expect(leverageToX10(2.5)).toBe(25);
    expect(sideToInt8("SELL")).toBe(-1);
    expect(sideToInt8("LONG")).toBe(1);
  });
});
