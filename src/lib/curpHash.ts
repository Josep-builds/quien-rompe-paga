/**
 * k-anonymity CURP hashing for the /verificar victim check.
 *
 * The browser hashes the CURP and sends only a 5-char hex prefix to
 * /api/lookup; the exact match happens on the device against the bucket
 * the server returns. See docs/PACKET.md §10 (shadow clause).
 *
 * SIMULATED_SALT is deliberately NOT a secret — it has to be computable
 * client-side to reproduce the same hash the DB seed used
 * (supabase/migrations/003_breach_index.sql, which must use this exact
 * string). It does not raise the security bar: CURPs are guessable
 * enough that hashing alone can be brute-forced, which is exactly why
 * Condition #3's partner-verification gate must run before any lookup,
 * not this salt.
 */

export const SIMULATED_SALT = "qrp-simulado-salt-v1";

export const HASH_PREFIX_LENGTH = 5;

/** Uppercase + trim so "  simu..." and "SIMU..." hash identically. */
export function normalizeCurp(curp: string): string {
  return curp.trim().toUpperCase();
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256(SIMULATED_SALT + normalized CURP), as lowercase hex. */
export async function computeCurpHash(curp: string): Promise<string> {
  const normalized = normalizeCurp(curp);
  const data = new TextEncoder().encode(SIMULATED_SALT + normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

export function hashPrefix(hash: string, length: number = HASH_PREFIX_LENGTH): string {
  return hash.slice(0, length);
}

export function isValidHashPrefix(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${HASH_PREFIX_LENGTH}}$`).test(value);
}
