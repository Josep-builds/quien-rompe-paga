"use server";

import { computeQuote, PricingValidationError } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DATA_TYPES = new Set(["CURP", "INE", "Teléfono", "Datos financieros"]);
const MAX_DATA_TYPES = ALLOWED_DATA_TYPES.size;

export interface SaveQuoteInput {
  recordsAffected: string;
  sensitiveData: boolean;
  dataTypes: string[];
}

export type SaveQuoteResult =
  | { ok: true; quoteId: string }
  | { ok: false; error: string };

/**
 * Recomputes the quote server-side from the raw form inputs (never trusts
 * client-computed numbers) and persists it for the signed-in user's
 * company. A companies row is created automatically on first sign-in by
 * the handle_new_user() trigger (see supabase/migrations/001_init.sql).
 */
export async function saveQuote(input: SaveQuoteInput): Promise<SaveQuoteResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Inicia sesión con Google para guardar la cotización." };
  }

  if (!Array.isArray(input.dataTypes) || input.dataTypes.length > MAX_DATA_TYPES) {
    return { ok: false, error: "Tipo de datos inválido." };
  }
  const dataTypes = Array.from(new Set(input.dataTypes)).filter((type) =>
    ALLOWED_DATA_TYPES.has(type),
  );

  let quote;
  try {
    quote = computeQuote({
      recordsAffected: input.recordsAffected,
      sensitiveData: input.sensitiveData === true,
    });
  } catch (err) {
    if (err instanceof PricingValidationError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (companyError || !company) {
    return { ok: false, error: "No se encontró la empresa asociada a tu cuenta." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("quotes")
    .insert({
      company_id: company.id,
      records_affected: quote.recordsAffected,
      sensitive_data: input.sensitiveData === true,
      data_types: dataTypes,
      contracted_capacity: quote.contractedCapacity,
      fine_ceiling: quote.fineCeiling,
      expected_cases: quote.expectedCases,
      setup_fee: quote.setupFee,
      cases_cost: quote.casesCost,
      surge_reserve: quote.surgeReserve,
      plan_total: quote.planTotal,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: "No se pudo guardar la cotización." };
  }

  return { ok: true, quoteId: inserted.id as string };
}
