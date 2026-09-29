"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./CasosDashboard.module.css";
import {
  approveNotice,
  draftNotice,
  generateSimulatedCases,
  resolveCase,
  updateContractedCapacity,
} from "@/app/quotes/[id]/actions";
import { computeInvoice } from "@/lib/invoice";

export interface QuoteRow {
  id: string;
  records_affected: number;
  sensitive_data: boolean;
  data_types: string[] | null;
  contracted_capacity: number;
  setup_fee: number;
  plan_total: number;
  fine_ceiling: number;
  notice_approved_text: string | null;
  notice_approved_at: string | null;
  created_at: string;
}

export interface CaseRow {
  id: string;
  victim_alias: string;
  status: "open" | "resolved";
  is_surge: boolean;
  evidence_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export function CasosDashboard({ quote, cases }: { quote: QuoteRow; cases: CaseRow[] }) {
  const router = useRouter();
  const [capacityInput, setCapacityInput] = useState(String(quote.contracted_capacity));
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [capacitySaving, setCapacitySaving] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const hasCases = cases.length > 0;

  const invoice = computeInvoice({
    setupFee: quote.setup_fee,
    cases: cases.map((c) => ({ status: c.status, isSurge: c.is_surge })),
  });

  async function handleUpdateCapacity() {
    setCapacityError(null);
    const parsed = Number(capacityInput);
    setCapacitySaving(true);
    const result = await updateContractedCapacity(quote.id, parsed);
    setCapacitySaving(false);
    if (!result.ok) {
      setCapacityError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleGenerate() {
    setGenerateError(null);
    setGenerating(true);
    const result = await generateSimulatedCases(quote.id);
    setGenerating(false);
    if (!result.ok) {
      setGenerateError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <Link href="/quotes" className={styles.backLink}>
        ← Mis cotizaciones
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Panel de casos</h1>
        <span className={styles.badge}>DATOS SIMULADOS · cifras ilustrativas</span>
      </div>
      <p className={styles.summary}>
        {quote.records_affected.toLocaleString("es-MX")} registros afectados
        {quote.sensitive_data ? " · datos sensibles" : ""} · Plan de recuperación:{" "}
        {currency.format(quote.plan_total)}
      </p>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Capacidad contratada (primeras 72h)</div>
        <div className={styles.capacityRow}>
          <input
            type="text"
            inputMode="numeric"
            value={capacityInput}
            disabled={hasCases}
            onChange={(e) => setCapacityInput(e.target.value)}
          />
          <button
            type="button"
            className={styles.button}
            onClick={handleUpdateCapacity}
            disabled={hasCases || capacitySaving}
          >
            {capacitySaving ? "Guardando…" : "Actualizar capacidad"}
          </button>
        </div>
        {capacityError && <div className={styles.error}>{capacityError}</div>}
        <p className={styles.hint}>
          {hasCases
            ? "La capacidad ya no se puede cambiar: los casos de este plan ya fueron generados."
            : "Casos generados por arriba de esta capacidad se facturan con recargo de surge (+30%)."}
        </p>
      </div>

      <NoticePanel quote={quote} onApproved={() => router.refresh()} />

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Casos simulados</div>
        {hasCases ? (
          <p className={styles.hint}>{cases.length} casos ya generados para esta cotización.</p>
        ) : (
          <>
            <button
              type="button"
              className={styles.button}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? "Generando…" : "Generar casos simulados"}
            </button>
            {generateError && <div className={styles.error}>{generateError}</div>}
            <p className={styles.hint}>
              Genera 120 casos de víctimas inventadas, etiquetadas SIMULADO — sin datos reales.
            </p>
          </>
        )}
      </div>

      {hasCases && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Víctima</th>
                  <th>Estado</th>
                  <th>Evidencia</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.victim_alias}
                      {c.is_surge && <span className={styles.surgeBadge}>SURGE</span>}
                    </td>
                    <td
                      className={c.status === "open" ? styles.statusOpen : styles.statusResolved}
                    >
                      {c.status === "open" ? "Abierto" : "Resuelto"}
                    </td>
                    <td>
                      {c.status === "resolved" ? (
                        c.evidence_note
                      ) : (
                        <ResolveCaseForm caseId={c.id} onResolved={() => router.refresh()} />
                      )}
                    </td>
                    <td>{new Date(c.created_at).toLocaleDateString("es-MX")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.invoiceBar}>
            Casos: {invoice.openCount.toLocaleString("es-MX")} abiertos ·{" "}
            {invoice.resolvedCount.toLocaleString("es-MX")} resueltos · Facturable:{" "}
            {currency.format(invoice.billableTotal)}
          </div>
        </>
      )}
    </main>
  );
}

function ResolveCaseForm({ caseId, onResolved }: { caseId: string; onResolved: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve() {
    setError(null);
    if (note.trim().length === 0) {
      setError("La nota de evidencia es obligatoria.");
      return;
    }
    setSaving(true);
    const result = await resolveCase(caseId, note);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onResolved();
  }

  return (
    <div className={styles.evidenceForm}>
      <textarea
        placeholder="Nota de evidencia (obligatoria)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
      />
      <button
        type="button"
        className={styles.smallButton}
        onClick={handleResolve}
        disabled={saving || note.trim().length === 0}
      >
        {saving ? "Guardando…" : "Marcar resuelto"}
      </button>
      {error && <span className={styles.smallError}>{error}</span>}
    </div>
  );
}

type NoticeState =
  | { status: "idle" }
  | { status: "drafting" }
  | { status: "draft"; text: string }
  | { status: "approving"; text: string }
  | { status: "error"; message: string };

function NoticePanel({ quote, onApproved }: { quote: QuoteRow; onApproved: () => void }) {
  const [state, setState] = useState<NoticeState>({ status: "idle" });

  async function handleDraft() {
    setState({ status: "drafting" });
    const result = await draftNotice(quote.id);
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "draft", text: result.data.draft });
  }

  async function handleApprove() {
    if (state.status !== "draft" && state.status !== "approving") return;
    const text = state.text;
    setState({ status: "approving", text });
    const result = await approveNotice(quote.id, text);
    if (!result.ok) {
      setState({ status: "error", message: result.error });
      return;
    }
    onApproved();
  }

  const editableText =
    state.status === "draft" || state.status === "approving" ? state.text : null;

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>Aviso de brecha</div>

      {quote.notice_approved_text && editableText === null && (
        <div className={styles.hint}>
          Texto aprobado el{" "}
          {quote.notice_approved_at
            ? new Date(quote.notice_approved_at).toLocaleString("es-MX")
            : ""}
          .
        </div>
      )}

      {editableText === null ? (
        <>
          <button
            type="button"
            className={styles.button}
            onClick={handleDraft}
            disabled={state.status === "drafting"}
          >
            {state.status === "drafting" ? "Redactando…" : "Redactar aviso con IA"}
          </button>
          {state.status === "error" && <div className={styles.error}>{state.message}</div>}
          <p className={styles.hint}>
            Usa solo el número de registros y los tipos de datos de esta cotización — nunca
            nombres ni identificadores de víctimas.
          </p>
          {quote.notice_approved_text && (
            <div className={styles.approvedNoticeBox}>{quote.notice_approved_text}</div>
          )}
        </>
      ) : (
        <>
          <span className={styles.aiBadge}>GENERADO POR IA — requiere aprobación humana</span>
          <textarea
            className={styles.noticeTextarea}
            value={editableText}
            onChange={(e) => setState({ status: "draft", text: e.target.value })}
            maxLength={5000}
          />
          <div className={styles.capacityRow}>
            <button
              type="button"
              className={styles.button}
              onClick={handleApprove}
              disabled={state.status === "approving" || editableText.trim().length === 0}
            >
              {state.status === "approving" ? "Guardando…" : "Aprobar texto"}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={handleDraft}
              disabled={state.status === "approving"}
            >
              Redactar de nuevo
            </button>
          </div>
          {state.status === "error" && <div className={styles.error}>{state.message}</div>}
          <p className={styles.hint}>
            Nada se publica hasta que apruebes el texto. Puedes editarlo antes de aprobar.
          </p>
        </>
      )}
    </div>
  );
}
