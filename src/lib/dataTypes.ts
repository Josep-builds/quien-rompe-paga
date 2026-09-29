/**
 * Single source of truth for the "tipo de datos" field used by the quote
 * form, saveQuote, and draftNotice. A quote with zero data types breaks
 * notice drafting (the model has nothing to tie its five moves to), so
 * this is validated everywhere the list is accepted as input - never
 * silently allowed to be empty.
 */

export class DataTypesValidationError extends Error {}

export const DATA_TYPE_OPTIONS = ["CURP", "INE", "Teléfono", "Datos financieros"] as const;

export type DataType = (typeof DATA_TYPE_OPTIONS)[number];

const ALLOWED_DATA_TYPES = new Set<string>(DATA_TYPE_OPTIONS);

const EMPTY_MESSAGE = "Selecciona al menos un tipo de dato expuesto.";

/**
 * Validates a raw data-types value (as received from a form or a server
 * action argument): must resolve to a non-empty, deduplicated array of
 * known values. Throws DataTypesValidationError otherwise - unknown
 * values are dropped, not silently kept, so a client bug can't sneak an
 * arbitrary string into storage.
 */
export function validateDataTypes(value: unknown): DataType[] {
  if (!Array.isArray(value)) {
    throw new DataTypesValidationError(EMPTY_MESSAGE);
  }

  const deduped = Array.from(new Set(value)).filter(
    (type): type is DataType => typeof type === "string" && ALLOWED_DATA_TYPES.has(type),
  );

  if (deduped.length === 0) {
    throw new DataTypesValidationError(EMPTY_MESSAGE);
  }

  return deduped;
}
