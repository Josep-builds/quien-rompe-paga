/**
 * Pure pricing engine for Quien Rompe, Paga.
 *
 * All figures are illustrative assumptions (docs/PACKET.md §9), not market
 * data. Regulatory basis is the LFPDPPP only — never cite INAI, it was
 * abolished. No network/DB calls here; keep this module side-effect free
 * so it stays independently testable.
 */

export class PricingValidationError extends Error {}

export interface PricingConfig {
  /**
   * MXN daily value of one UMA. Official 2026 value: $117.31, published by
   * INEGI in the DOF on 2026-01-09, effective 2026-02-01 to 2027-01-31.
   * Source: https://dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09%2F01%2F2026
   */
  umaValue: number;
  /** Fine ceiling base, in UMA units, per LFPDPPP. */
  fineBaseMultiplierUma: number;
  /** Multiplier applied to the fine ceiling when sensitive data is involved. */
  sensitiveMultiplier: number;
  /** Share of exposed records expected to seek help. Biggest unknown per packet. */
  activationRate: number;
  /** Flat setup fee: notice drafting, partner link, onboarding. */
  setupFee: number;
  /** Fee charged per resolved case (never per notification sent). */
  feePerResolvedCase: number;
  /**
   * Default contracted case capacity for the first 72h after publication.
   * Cases above this line draw on the surge reserve (Blueprint Bet 3 /
   * Condition #5).
   */
  defaultContractedCapacity: number;
  /** Surge premium applied to cases above contracted capacity: +30%. */
  surgeRate: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  umaValue: 117.31,
  fineBaseMultiplierUma: 320_000,
  sensitiveMultiplier: 2,
  activationRate: 0.02,
  setupFee: 150_000,
  feePerResolvedCase: 800,
  defaultContractedCapacity: 500,
  surgeRate: 0.3,
};

export const MIN_RECORDS_AFFECTED = 1;
export const MAX_RECORDS_AFFECTED = 200_000_000;

export interface QuoteInput {
  /** Number of exposed records. Integer, 1..200,000,000. */
  recordsAffected: number | string;
  sensitiveData: boolean;
  /**
   * Contracted case capacity for the first 72h. Defaults to
   * config.defaultContractedCapacity (500). Expected cases above this
   * capacity draw on the surge reserve.
   */
  contractedCapacity?: number;
}

export interface QuoteResult {
  recordsAffected: number;
  fineCeiling: number;
  expectedCases: number;
  contractedCapacity: number;
  casesAboveCapacity: number;
  /** setup fee, per plan config. */
  setupFee: number;
  /** expectedCases × feePerResolvedCase — the base recovery cost line. */
  casesCost: number;
  /** casesAboveCapacity × feePerResolvedCase × surgeRate. */
  surgeReserve: number;
  /** setupFee + casesCost + surgeReserve. */
  planTotal: number;
  /** fineCeiling / planTotal, e.g. 9.19 → shown as "9:1". */
  ratio: number;
}

/**
 * Accepts the raw form value (string or number) and returns a validated
 * integer, or throws PricingValidationError. Rejects non-integers,
 * out-of-range values, and non-numeric text — never silently coerces.
 */
export function validateRecordsAffected(value: unknown): number {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    throw new PricingValidationError(
      "Registros afectados debe ser un número entero.",
    );
  }

  if (!Number.isInteger(parsed)) {
    throw new PricingValidationError(
      "Registros afectados debe ser un número entero.",
    );
  }

  if (parsed < MIN_RECORDS_AFFECTED || parsed > MAX_RECORDS_AFFECTED) {
    throw new PricingValidationError(
      `Registros afectados debe estar entre ${MIN_RECORDS_AFFECTED.toLocaleString(
        "es-MX",
      )} y ${MAX_RECORDS_AFFECTED.toLocaleString("es-MX")}.`,
    );
  }

  return parsed;
}

function validateContractedCapacity(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PricingValidationError(
      "La capacidad contratada debe ser un número entero mayor o igual a 0.",
    );
  }
  return value;
}

/**
 * Quote = setup + (records × activation × fee per resolved case) + surge reserve.
 * Surge reserve = max(0, expectedCases - contractedCapacity) × fee × surgeRate.
 * Fine ceiling = 320,000 × UMA, ×2 if sensitive.
 */
export function computeQuote(
  input: QuoteInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): QuoteResult {
  const recordsAffected = validateRecordsAffected(input.recordsAffected);
  const contractedCapacity = validateContractedCapacity(
    input.contractedCapacity ?? config.defaultContractedCapacity,
  );

  const fineCeiling =
    config.fineBaseMultiplierUma *
    config.umaValue *
    (input.sensitiveData ? config.sensitiveMultiplier : 1);

  const expectedCases = Math.round(recordsAffected * config.activationRate);
  const casesAboveCapacity = Math.max(0, expectedCases - contractedCapacity);

  const setupFee = config.setupFee;
  const casesCost = expectedCases * config.feePerResolvedCase;
  const surgeReserve = casesAboveCapacity * config.feePerResolvedCase * config.surgeRate;

  const planTotal = setupFee + casesCost + surgeReserve;

  const ratio = planTotal > 0 ? fineCeiling / planTotal : 0;

  return {
    recordsAffected,
    fineCeiling,
    expectedCases,
    contractedCapacity,
    casesAboveCapacity,
    setupFee,
    casesCost,
    surgeReserve,
    planTotal,
    ratio,
  };
}
