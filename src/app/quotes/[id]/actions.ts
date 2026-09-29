"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const SIMULATED_CASE_COUNT = 120;
const MAX_EVIDENCE_NOTE_LENGTH = 2000;

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

/**
 * Marks a case resolved. Requires a non-empty, length-capped evidence
 * note - enforced here (and by the DB CHECK constraint on public.cases)
 * regardless of what the UI does. resolved_at is set by the DB trigger.
 */
export async function resolveCase(caseId: string, evidenceNote: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Inicia sesión con Google para continuar." };
  }

  const trimmed = evidenceNote.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "La nota de evidencia no puede estar vacía." };
  }
  if (trimmed.length > MAX_EVIDENCE_NOTE_LENGTH) {
    return {
      ok: false,
      error: `La nota de evidencia no puede superar ${MAX_EVIDENCE_NOTE_LENGTH} caracteres.`,
    };
  }

  const { data, error } = await supabase
    .from("cases")
    .update({ status: "resolved", evidence_note: trimmed })
    .eq("id", caseId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "No se pudo marcar el caso como resuelto." };
  }

  return { ok: true, data: undefined };
}

const NOTICE_MODEL = "claude-haiku-4-5";
const MAX_NOTICE_TEXT_LENGTH = 5000;

const NOTICE_SYSTEM_PROMPT = `Eres un asistente que redacta avisos de brecha de datos para empresas mexicanas, en español mexicano sencillo y directo, sin tecnicismos legales innecesarios.

Se te darán únicamente el número de registros afectados y los tipos de datos expuestos — nunca recibirás nombres, CURPs ni ningún identificador de víctimas. No inventes cifras, nombres ni datos que no se te dieron.

Genera exactamente dos partes, en este orden:
1. Un aviso breve (2-3 párrafos, sin subtítulos) explicando qué pasó, sin alarmar innecesariamente.
2. La línea "Cinco acciones recomendadas:" seguida de una lista numerada del 1 al 5 (formato "1. texto", uno por línea). Cada acción debe estar explícitamente relacionada con al menos uno de los tipos de datos expuestos que se te dieron.

Reglas estrictas de formato:
- Texto plano únicamente. NUNCA uses Markdown: nada de #, ##, **, __, guiones de viñeta, ni bloques de código.
- No uses un título en mayúsculas tipo "AVISO DE BRECHA DE DATOS".
- No uses saludos ("Estimado cliente", "Querido cliente") ni firmas ni despedidas.
- No uses subtítulos como "¿Qué pasó?" — el aviso es prosa corrida en párrafos.

Reglas de contenido:
- Nunca menciones al INAI — fue abolido y ya no existe. Si citas una base legal, usa únicamente la LFPDPPP.
- No agregues la etiqueta "generado por IA" ni similar dentro del texto — eso lo maneja la interfaz, no tú.
- No agregues preámbulos. Responde solo con el aviso y la lista de acciones.`;

function buildNoticeUserPrompt(dataTypes: string[], recordsAffected: number): string {
  const typesText = dataTypes.length > 0 ? dataTypes.join(", ") : "no especificados";
  return `Registros afectados: ${recordsAffected.toLocaleString("es-MX")}.\nTipos de datos expuestos: ${typesText}.`;
}

/**
 * Drafts a breach notice + five moves via the Anthropic API. Sends only
 * the quote's data types and record count - never victim names or
 * identifiers. The draft is returned to the caller and NOT persisted;
 * only approveNotice() below writes anything to the database.
 */
export async function draftNotice(quoteId: string): Promise<ActionResult<{ draft: string }>> {
  const owner = await requireQuoteOwner(quoteId);
  if (!owner.ok) return owner;
  const { supabase, quote } = owner;

  const { data: quoteDetails, error: fetchError } = await supabase
    .from("quotes")
    .select("data_types, records_affected")
    .eq("id", quote.id)
    .single();

  if (fetchError || !quoteDetails) {
    return { ok: false, error: "No se pudo cargar la cotización." };
  }

  const dataTypes = (quoteDetails.data_types as string[] | null) ?? [];
  const recordsAffected = quoteDetails.records_affected as number;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "El servicio de IA no está configurado." };
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: NOTICE_MODEL,
      max_tokens: 1024,
      system: NOTICE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildNoticeUserPrompt(dataTypes, recordsAffected) },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text" || textBlock.text.trim().length === 0) {
      return { ok: false, error: "La IA no devolvió un aviso. Intenta de nuevo." };
    }

    return { ok: true, data: { draft: textBlock.text } };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Error de configuración del servicio de IA." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: "El servicio de IA está saturado en este momento. Intenta de nuevo en unos segundos.",
      };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "No se pudo conectar con el servicio de IA." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: "El servicio de IA no pudo generar el aviso en este momento." };
    }
    throw err;
  }
}

/**
 * Saves the human-approved notice text. Nothing is "published" before
 * this runs - the AI draft alone is never persisted.
 */
export async function approveNotice(quoteId: string, text: string): Promise<ActionResult> {
  const owner = await requireQuoteOwner(quoteId);
  if (!owner.ok) return owner;
  const { supabase, quote } = owner;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "El texto aprobado no puede estar vacío." };
  }
  if (trimmed.length > MAX_NOTICE_TEXT_LENGTH) {
    return {
      ok: false,
      error: `El texto no puede superar ${MAX_NOTICE_TEXT_LENGTH} caracteres.`,
    };
  }

  const { error } = await supabase
    .from("quotes")
    .update({ notice_approved_text: trimmed, notice_approved_at: new Date().toISOString() })
    .eq("id", quote.id);

  if (error) {
    return { ok: false, error: "No se pudo guardar el texto aprobado." };
  }

  return { ok: true, data: undefined };
}
