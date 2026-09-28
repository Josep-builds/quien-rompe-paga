import { describe, expect, it } from "vitest";
import {
  computeQuote,
  DEFAULT_PRICING_CONFIG,
  PricingValidationError,
  validateRecordsAffected,
} from "./pricing";

describe("computeQuote", () => {
  it("matches the hand calculation for 500,000 sensitive records at default capacity", () => {
    const result = computeQuote({ recordsAffected: 500_000, sensitiveData: true });

    // 320,000 * 117.31 * 2
    expect(result.fineCeiling).toBe(75_078_400);
    // round(500,000 * 0.02)
    expect(result.expectedCases).toBe(10_000);
    expect(result.contractedCapacity).toBe(500);
    // 10,000 - 500
    expect(result.casesAboveCapacity).toBe(9_500);
    expect(result.setupFee).toBe(150_000);
    // 10,000 * 800
    expect(result.casesCost).toBe(8_000_000);
    // 9,500 * 800 * 0.30
    expect(result.surgeReserve).toBe(2_280_000);
    // 150,000 + 8,000,000 + 2,280,000
    expect(result.planTotal).toBe(10_430_000);
    expect(result.ratio).toBeCloseTo(7.1983, 3);
  });

  it("halves the fine ceiling when data is not sensitive", () => {
    const result = computeQuote({ recordsAffected: 500_000, sensitiveData: false });
    // 320,000 * 117.31
    expect(result.fineCeiling).toBe(37_539_200);
  });

  it("rounds expected cases to the nearest whole victim", () => {
    // 123 * 0.02 = 2.46 -> 2
    const result = computeQuote({ recordsAffected: 123, sensitiveData: false });
    expect(result.expectedCases).toBe(2);
  });

  it("charges no surge reserve when expected cases stay within contracted capacity", () => {
    // 20,000 records * 0.02 = 400 expected cases, under the 500 default capacity
    const result = computeQuote({ recordsAffected: 20_000, sensitiveData: false });
    expect(result.expectedCases).toBe(400);
    expect(result.casesAboveCapacity).toBe(0);
    expect(result.surgeReserve).toBe(0);
    expect(result.planTotal).toBe(result.setupFee + result.casesCost);
  });

  it("accepts a custom contracted capacity and recomputes the surge reserve", () => {
    const result = computeQuote({
      recordsAffected: 500_000,
      sensitiveData: true,
      contractedCapacity: 2_000,
    });
    expect(result.contractedCapacity).toBe(2_000);
    // 10,000 - 2,000
    expect(result.casesAboveCapacity).toBe(8_000);
    // 8,000 * 800 * 0.30
    expect(result.surgeReserve).toBe(1_920_000);
  });

  it("rejects a negative contracted capacity", () => {
    expect(() =>
      computeQuote({ recordsAffected: 100, sensitiveData: false, contractedCapacity: -1 }),
    ).toThrow(PricingValidationError);
  });

  it("rejects a non-integer contracted capacity", () => {
    expect(() =>
      computeQuote({ recordsAffected: 100, sensitiveData: false, contractedCapacity: 1.5 }),
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
