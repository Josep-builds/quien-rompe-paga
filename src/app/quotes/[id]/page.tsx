import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CasosDashboard, type CaseRow, type QuoteRow } from "@/components/CasosDashboard";

export default async function QuoteCasosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, records_affected, sensitive_data, contracted_capacity, setup_fee, plan_total, fine_ceiling, created_at",
    )
    .eq("id", id)
    .single<QuoteRow>();

  if (!quote) {
    notFound();
  }

  const { data: cases } = await supabase
    .from("cases")
    .select("id, victim_alias, status, is_surge, evidence_note, resolved_at, created_at")
    .eq("quote_id", id)
    .order("created_at", { ascending: true })
    .returns<CaseRow[]>();

  return <CasosDashboard quote={quote} cases={cases ?? []} />;
}
