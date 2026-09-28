import { describe, expect, it } from "vitest";
import {
  computeQuote,
  DEFAULT_PRICING_CONFIG,
  PricingValidationError,
  validateRecordsAffected,
} from "./pricing";

describe("computeQuote", () => {
  it("matches the hand calculation from the packet mockup (500,000 records, sensitive)", () => {
    const result = computeQuote({ recordsAffected: 500_000, sensitiveData: true });

    // 320,000 * 117 * 2
    expect(result.fineCeiling).toBe(74_880_000);
    // round(500,000 * 0.02)
    expect(result.expectedCases).toBe(10_000);
    // 150,000 + 10,000 * 800 + 0 surge reserve
    expect(result.planTotal).toBe(8_150_000);
    expect(result.ratio).toBeCloseTo(9.1877, 3);
  });

  it("halves the fine ceiling when data is not sensitive", () => {
    const result = computeQuote({ recordsAffected: 500_000, sensitiveData: false });
    // 320,000 * 117
    expect(result.fineCeiling).toBe(37_440_000);
  });

  it("rounds expected cases to the nearest whole victim", () => {
    // 123 * 0.02 = 2.46 -> 2
    const result = computeQuote({ recordsAffected: 123, sensitiveData: false });
    expect(result.expectedCases).toBe(2);
  });

  it("adds an explicit surge reserve to the plan total when provided", () => {
    const result = computeQuote({
      recordsAffected: 500_000,
      sensitiveData: true,
      surgeReserve: 1_000_000,
    });
    expect(result.planTotal).toBe(9_150_000);
  });

  it("rejects a negative surge reserve", () => {
    expect(() =>
      computeQuote({ recordsAffected: 100, sensitiveData: false, surgeReserve: -1 }),
    ).toThrow(PricingValidationError);
  });

  it("is a pure function: same input always yields the same output", () => {
    const input = { recordsAffected: 250_000, sensitiveData: true };
    expect(computeQuote(input)).toEqual(computeQuote(input));
  });

  it("respects a custom config (e.g. an updated UMA value)", () => {
    const result = computeQuote(
      { recordsAffected: 500_000, sensitiveData: true },
      { ...DEFAULT_PRICING_CONFIG, umaValue: 120 },
    );
    expect(result.fineCeiling).toBe(320_000 * 120 * 2);
  });

  it("accepts a numeric-string records value, as it would arrive from a form", () => {
    const result = computeQuote({ recordsAffected: "500000", sensitiveData: true });
    expect(result.recordsAffected).toBe(500_000);
  });
});

describe("validateRecordsAffected", () => {
  it("accepts the minimum and maximum boundary values", () => {
    expect(validateRecordsAffected(1)).toBe(1);
    expect(validateRecordsAffected(200_000_000)).toBe(200_000_000);
  });

  it("rejects a negative number", () => {
    expect(() => validateRecordsAffected(-1)).toThrow(PricingValidationError);
  });

  it("rejects zero", () => {
    expect(() => validateRecordsAffected(0)).toThrow(PricingValidationError);
  });

  it("rejects non-numeric text", () => {
    expect(() => validateRecordsAffected("abc")).toThrow(PricingValidationError);
  });

  it("rejects a value beyond the 200,000,000 ceiling (10^12)", () => {
    expect(() => validateRecordsAffected(10 ** 12)).toThrow(PricingValidationError);
  });

  it("rejects a non-integer number", () => {
    expect(() => validateRecordsAffected(1.5)).toThrow(PricingValidationError);
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(() => validateRecordsAffected("")).toThrow(PricingValidationError);
    expect(() => validateRecordsAffected("   ")).toThrow(PricingValidationError);
  });
});
