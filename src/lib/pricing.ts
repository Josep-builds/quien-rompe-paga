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
  /** MXN value of one UMA. Illustrative; verify the current year's value. */
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
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  umaValue: 117,
  fineBaseMultiplierUma: 320_000,
  sensitiveMultiplier: 2,
  activationRate: 0.02,
  setupFee: 150_000,
  feePerResolvedCase: 800,
};

export const MIN_RECORDS_AFFECTED = 1;
export const MAX_RECORDS_AFFECTED = 200_000_000;

export interface QuoteInput {
  /** Number of exposed records. Integer, 1..200,000,000. */
  recordsAffected: number | string;
  sensitiveData: boolean;
  /**
   * Optional pre-computed surge reserve to add to the plan total. Defaults
   * to 0 — surge pricing against contracted capacity is modeled per-case
   * at invoicing time (see docs/IMPLEMENTATION_PROMPT.md F13), not baked
   * into the initial quote.
   */
  surgeReserve?: number;
}

export interface QuoteResult {
  recordsAffected: number;
  fineCeiling: number;
  expectedCases: number;
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

/**
 * Quote = setup + (records × activation × fee per resolved case) + surge reserve.
 * Fine ceiling = 320,000 × UMA, ×2 if sensitive.
 */
export function computeQuote(
  input: QuoteInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): QuoteResult {
  const recordsAffected = validateRecordsAffected(input.recordsAffected);

  const surgeReserve = input.surgeReserve ?? 0;
  if (surgeReserve < 0) {
    throw new PricingValidationError("La reserva de surge no puede ser negativa.");
  }

  const fineCeiling =
    config.fineBaseMultiplierUma *
    config.umaValue *
    (input.sensitiveData ? config.sensitiveMultiplier : 1);

  const expectedCases = Math.round(recordsAffected * config.activationRate);

  const planTotal = config.setupFee + expectedCases * config.feePerResolvedCase + surgeReserve;

  const ratio = planTotal > 0 ? fineCeiling / planTotal : 0;

  return { recordsAffected, fineCeiling, expectedCases, planTotal, ratio };
}
