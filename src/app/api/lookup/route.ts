import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidHashPrefix } from "@/lib/curpHash";

/**
 * k-anonymity bucket lookup. Accepts only a 5-char hex prefix (never a
 * full hash, never a CURP) via POST body — not a query string, so it
 * never lands in a URL, browser history, or access log line. Returns
 * every hash sharing that prefix; the exact match happens on the
 * device. Deliberately does not log the request body or the prefix.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const prefix =
    typeof body === "object" && body !== null && "prefix" in body
      ? (body as { prefix: unknown }).prefix
      : undefined;

  if (typeof prefix !== "string" || !isValidHashPrefix(prefix)) {
    return NextResponse.json(
      { error: "El prefijo debe ser exactamente 5 caracteres hexadecimales en minúsculas." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("breach_index")
    .select("hash")
    .eq("hash_prefix", prefix);

  if (error) {
    return NextResponse.json({ error: "No se pudo consultar el índice." }, { status: 500 });
  }

  return NextResponse.json(
    { hashes: (data ?? []).map((row) => row.hash as string) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
