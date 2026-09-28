"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./CasosDashboard.module.css";
import { generateSimulatedCases, updateContractedCapacity } from "@/app/quotes/[id]/actions";

export interface QuoteRow {
  id: string;
  records_affected: number;
  sensitive_data: boolean;
  contracted_capacity: number;
  setup_fee: number;
  plan_total: number;
  fine_ceiling: number;
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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Víctima</th>
                <th>Estado</th>
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
                  <td className={c.status === "open" ? styles.statusOpen : styles.statusResolved}>
                    {c.status === "open" ? "Abierto" : "Resuelto"}
                  </td>
                  <td>{new Date(c.created_at).toLocaleDateString("es-MX")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
