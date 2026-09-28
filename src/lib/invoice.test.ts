import { describe, expect, it } from "vitest";
import {
  computeInvoice,
  DEFAULT_INVOICE_CONFIG,
  InvoiceValidationError,
  type InvoiceCase,
} from "./invoice";

const SETUP_FEE = 150_000;

function cases(spec: Array<[number, "open" | "resolved", boolean]>): InvoiceCase[] {
  return spec.flatMap(([count, status, isSurge]) =>
    Array.from({ length: count }, () => ({ status, isSurge })),
  );
}

describe("computeInvoice — packet test #4 (billing rule)", () => {
  it("generating cases (all open) adds MX$0 beyond setup — sending a notice never bills", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([[120, "open", false]]),
    });
    expect(result.caseFeesTotal).toBe(0);
    expect(result.billableTotal).toBe(SETUP_FEE);
  });

  it("resolving one case adds exactly one fee", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([
        [1, "resolved", false],
        [119, "open", false],
      ]),
    });
    expect(result.resolvedCount).toBe(1);
    expect(result.caseFeesTotal).toBe(DEFAULT_INVOICE_CONFIG.feePerResolvedCase);
    expect(result.billableTotal).toBe(SETUP_FEE + DEFAULT_INVOICE_CONFIG.feePerResolvedCase);
  });

  it("resolving a second case adds exactly one more fee — no double counting", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([
        [2, "resolved", false],
        [118, "open", false],
      ]),
    });
    expect(result.caseFeesTotal).toBe(2 * DEFAULT_INVOICE_CONFIG.feePerResolvedCase);
  });
});

describe("computeInvoice — packet test #5 (surge)", () => {
  it("bills a resolved surge case at fee × 1.3", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([[1, "resolved", true]]),
    });
    expect(result.resolvedSurgeCount).toBe(1);
    expect(result.caseFeesTotal).toBe(DEFAULT_INVOICE_CONFIG.feePerResolvedCase * 1.3);
  });

  it("open surge cases do not bill until resolved", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([[70, "open", true]]),
    });
    expect(result.caseFeesTotal).toBe(0);
  });

  it("mixes base and surge resolved cases correctly (120 simulated cases, capacity 50)", () => {
    // 50 within capacity, 70 above -> surge
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([
        [50, "resolved", false],
        [70, "resolved", true],
      ]),
    });
    expect(result.resolvedBaseCount).toBe(50);
    expect(result.resolvedSurgeCount).toBe(70);
    const expectedCaseFees = 50 * 800 + 70 * 800 * 1.3;
    expect(result.caseFeesTotal).toBe(expectedCaseFees);
    expect(result.billableTotal).toBe(SETUP_FEE + expectedCaseFees);
  });
});

describe("computeInvoice — general behavior", () => {
  it("counts open cases separately from resolved ones", () => {
    const result = computeInvoice({
      setupFee: SETUP_FEE,
      cases: cases([
        [86, "open", false],
        [34, "resolved", false],
      ]),
    });
    expect(result.openCount).toBe(86);
    expect(result.resolvedCount).toBe(34);
  });

  it("matches the mockup-style summary: 120 open, 0 resolved -> Facturable = setup only", () => {
    const result = computeInvoice({ setupFee: SETUP_FEE, cases: cases([[120, "open", false]]) });
    expect(result.openCount).toBe(120);
    expect(result.resolvedCount).toBe(0);
    expect(result.billableTotal).toBe(SETUP_FEE);
  });

  it("handles an empty case list (billable = setup only)", () => {
    const result = computeInvoice({ setupFee: SETUP_FEE, cases: [] });
    expect(result.billableTotal).toBe(SETUP_FEE);
  });

  it("is a pure function: same input always yields the same output", () => {
    const input = { setupFee: SETUP_FEE, cases: cases([[5, "resolved", false], [3, "open", false]]) };
    expect(computeInvoice(input)).toEqual(computeInvoice(input));
  });

  it("rejects a negative setup fee", () => {
    expect(() => computeInvoice({ setupFee: -1, cases: [] })).toThrow(InvoiceValidationError);
  });

  it("respects a custom config (e.g. a different surge rate)", () => {
    const result = computeInvoice(
      { setupFee: 0, cases: cases([[1, "resolved", true]]) },
      { feePerResolvedCase: 1000, surgeRate: 0.5 },
    );
    expect(result.caseFeesTotal).toBe(1500);
  });
});
