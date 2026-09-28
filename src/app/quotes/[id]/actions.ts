"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const SIMULATED_CASE_COUNT = 120;

// Invented names only, always suffixed "(SIMULADO)" - no real victim data.
const SIMULATED_FIRST_NAMES = [
  "María", "José", "Juan", "Guadalupe", "Alejandra", "Miguel", "Fernanda",
  "Luis", "Verónica", "Carlos", "Patricia", "Jorge", "Claudia", "Ricardo",
  "Rosa", "Francisco", "Elena", "Arturo", "Diana", "Sergio",
];
const SIMULATED_LAST_NAMES = [
  "García", "Hernández", "López", "Martínez", "Rodríguez", "Pérez",
  "Sánchez", "Ramírez", "Torres", "Flores", "Vázquez", "Gómez", "Díaz",
  "Reyes", "Morales", "Jiménez", "Ruiz", "Ortiz", "Cruz", "Castillo",
];

function simulatedVictimAlias(index: number): string {
  const first = SIMULATED_FIRST_NAMES[index % SIMULATED_FIRST_NAMES.length];
  const last =
    SIMULATED_LAST_NAMES[Math.floor(index / SIMULATED_FIRST_NAMES.length) % SIMULATED_LAST_NAMES.length];
  return `${first} ${last} #${String(index + 1).padStart(3, "0")} (SIMULADO)`;
}

async function requireQuoteOwner(quoteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Inicia sesión con Google para continuar." };
  }

  // RLS already scopes this select to the caller's own company; a miss
  // means either the quote doesn't exist or isn't theirs - same message
  // either way, no ownership info leaked.
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, company_id, contracted_capacity")
    .eq("id", quoteId)
    .single();

  if (error || !quote) {
    return { ok: false as const, error: "Cotización no encontrada." };
  }

  return { ok: true as const, supabase, quote };
}

/**
 * Creates exactly 120 invented, SIMULADO-labeled victim cases for a
 * saved quote. Refuses to run twice for the same quote so re-clicking
 * never doubles the case count. is_surge is fixed at generation time
 * from the quote's current contracted_capacity - the first `capacity`
 * cases are within capacity, the rest draw the surge line at invoicing.
 */
export async function generateSimulatedCases(
  quoteId: string,
): Promise<ActionResult<{ inserted: number }>> {
  const owner = await requireQuoteOwner(quoteId);
  if (!owner.ok) return owner;
  const { supabase, quote } = owner;

  const { count, error: countError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quoteId);

  if (countError) {
    return { ok: false, error: "No se pudo verificar los casos existentes." };
  }
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Ya se generaron casos simulados para esta cotización." };
  }

  const capacity = quote.contracted_capacity as number;
  const rows = Array.from({ length: SIMULATED_CASE_COUNT }, (_, i) => ({
    company_id: quote.company_id,
    quote_id: quote.id,
    victim_alias: simulatedVictimAlias(i),
    status: "open" as const,
    is_surge: i + 1 > capacity,
  }));

  const { error: insertError } = await supabase.from("cases").insert(rows);
  if (insertError) {
    return { ok: false, error: "No se pudieron generar los casos simulados." };
  }

  return { ok: true, data: { inserted: rows.length } };
}

/**
 * Only allowed before any cases exist for the quote - is_surge is baked
 * in at generation time, so changing capacity afterwards would silently
 * desync the invoice from what's on screen.
 */
export async function updateContractedCapacity(
  quoteId: string,
  capacity: number,
): Promise<ActionResult> {
  const owner = await requireQuoteOwner(quoteId);
  if (!owner.ok) return owner;
  const { supabase, quote } = owner;

  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1_000_000) {
    return { ok: false, error: "La capacidad debe ser un entero entre 0 y 1,000,000." };
  }

  const { count, error: countError } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quoteId);

  if (countError) {
    return { ok: false, error: "No se pudo verificar los casos existentes." };
  }
  if ((count ?? 0) > 0) {
    return { ok: false, error: "No se puede cambiar la capacidad después de generar casos." };
  }

  const { error } = await supabase
    .from("quotes")
    .update({ contracted_capacity: capacity })
    .eq("id", quote.id);

  if (error) {
    return { ok: false, error: "No se pudo actualizar la capacidad." };
  }

  return { ok: true, data: undefined };
}
