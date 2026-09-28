/**
 * Pure invoicing engine for Quien Rompe, Paga.
 *
 * Invoice = setup + Σ resolved cases × fee (× 1.3 if surge), per
 * docs/PACKET.md §9. Generating/publishing cases never adds a line —
 * only resolving one does. No network/DB calls here; keep this module
 * side-effect free so it stays independently testable.
 */

export class InvoiceValidationError extends Error {}

export interface InvoiceConfig {
  feePerResolvedCase: number;
  /** Surge premium: a resolved surge case bills at fee × (1 + surgeRate). */
  surgeRate: number;
}

export const DEFAULT_INVOICE_CONFIG: InvoiceConfig = {
  feePerResolvedCase: 800,
  surgeRate: 0.3,
};

export type CaseStatus = "open" | "resolved";

export interface InvoiceCase {
  status: CaseStatus;
  /** True if this case was opened above contracted capacity in the first 72h. */
  isSurge: boolean;
}

export interface InvoiceInput {
  setupFee: number;
  cases: InvoiceCase[];
}

export interface InvoiceResult {
  openCount: number;
  resolvedCount: number;
  resolvedBaseCount: number;
  resolvedSurgeCount: number;
  setupFee: number;
  caseFeesTotal: number;
  /** setupFee + caseFeesTotal. */
  billableTotal: number;
}

/**
 * Recomputes the invoice from the full list of a quote's cases. Derived,
 * not a separately mutable counter, so it can never drift from the case
 * table — resolving a case is the only thing that changes the total.
 */
export function computeInvoice(
  input: InvoiceInput,
  config: InvoiceConfig = DEFAULT_INVOICE_CONFIG,
): InvoiceResult {
  if (input.setupFee < 0) {
    throw new InvoiceValidationError("El setup fee no puede ser negativo.");
  }
  if (config.feePerResolvedCase < 0 || config.surgeRate < 0) {
    throw new InvoiceValidationError("La configuración de facturación no puede ser negativa.");
  }

  let openCount = 0;
  let resolvedBaseCount = 0;
  let resolvedSurgeCount = 0;

  for (const c of input.cases) {
    if (c.status === "open") {
      openCount += 1;
    } else if (c.isSurge) {
      resolvedSurgeCount += 1;
    } else {
      resolvedBaseCount += 1;
    }
  }

  const resolvedCount = resolvedBaseCount + resolvedSurgeCount;

  const caseFeesTotal =
    resolvedBaseCount * config.feePerResolvedCase +
    resolvedSurgeCount * config.feePerResolvedCase * (1 + config.surgeRate);

  const billableTotal = input.setupFee + caseFeesTotal;

  return {
    openCount,
    resolvedCount,
    resolvedBaseCount,
    resolvedSurgeCount,
    setupFee: input.setupFee,
    caseFeesTotal,
    billableTotal,
  };
}
