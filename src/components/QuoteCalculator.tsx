"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "@/app/page.module.css";
import {
  computeQuote,
  MAX_RECORDS_AFFECTED,
  MIN_RECORDS_AFFECTED,
  PricingValidationError,
  QuoteResult,
} from "@/lib/pricing";
import { saveQuote } from "@/app/quotes/actions";

const DATA_TYPE_OPTIONS = ["CURP", "INE", "Teléfono", "Datos financieros"];

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; quoteId: string }
  | { status: "error"; message: string };

export function QuoteCalculator({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [recordsAffected, setRecordsAffected] = useState("");
  const [dataTypes, setDataTypes] = useState<string[]>([]);
  const [sensitiveData, setSensitiveData] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  function toggleDataType(type: string) {
    setDataTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState({ status: "idle" });
    try {
      const quote = computeQuote({ recordsAffected, sensitiveData });
      setResult(quote);
      setError(null);
    } catch (err) {
      if (err instanceof PricingValidationError) {
        setError(err.message);
        setResult(null);
      } else {
        throw err;
      }
    }
  }

  async function handleSave() {
    setSaveState({ status: "saving" });
    const outcome = await saveQuote({ recordsAffected, sensitiveData, dataTypes });
    if (outcome.ok) {
      setSaveState({ status: "saved", quoteId: outcome.quoteId });
    } else {
      setSaveState({ status: "error", message: outcome.error });
    }
  }

  const ratioLabel = result ? `${Math.max(1, Math.round(result.ratio))}:1` : null;
  const ratioFillPct = result
    ? Math.min(100, (1 / Math.max(1, Math.round(result.ratio) + 1)) * 100)
    : 0;

  return (
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="records">Registros afectados</label>
          <input
            id="records"
            type="text"
            inputMode="numeric"
            placeholder={`Entre ${MIN_RECORDS_AFFECTED.toLocaleString("es-MX")} y ${MAX_RECORDS_AFFECTED.toLocaleString("es-MX")}`}
            value={recordsAffected}
            onChange={(e) => setRecordsAffected(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Tipo de datos</label>
          <div className={styles.checkboxGroup}>
            {DATA_TYPE_OPTIONS.map((type) => (
              <label key={type} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={dataTypes.includes(type)}
                  onChange={() => toggleDataType(type)}
                />
                {type}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={sensitiveData}
              onChange={(e) => setSensitiveData(e.target.checked)}
            />
            ¿Datos sensibles?
          </label>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit}>
          Calcular cotización
        </button>
      </form>

      <div className={styles.results}>
        {result ? (
          <>
            <div className={styles.cards}>
              <div className={`${styles.card} ${styles.cardFine}`}>
                <div className={styles.cardLabel}>Multa máxima LFPDPPP</div>
                <div className={styles.cardValue}>{currency.format(result.fineCeiling)}</div>
                <div className={styles.cardNote}>Techo estatutario, no un cálculo legal.</div>
              </div>
              <div className={`${styles.card} ${styles.cardPlan}`}>
                <div className={styles.cardLabel}>Plan de recuperación</div>
                <div className={styles.cardValue}>{currency.format(result.planTotal)}</div>
                <div className={styles.cardNote}>
                  Solo pagas por víctima resuelta ({result.expectedCases.toLocaleString("es-MX")} casos esperados).
                </div>
                <ul className={styles.cardBreakdown}>
                  <li>
                    <span>Setup</span>
                    <span>{currency.format(result.setupFee)}</span>
                  </li>
                  <li>
                    <span>Casos esperados × cuota</span>
                    <span>{currency.format(result.casesCost)}</span>
                  </li>
                  <li>
                    <span>
                      Reserva de surge
                      {result.casesAboveCapacity > 0
                        ? ` (${result.casesAboveCapacity.toLocaleString("es-MX")} casos sobre capacidad de ${result.contractedCapacity.toLocaleString("es-MX")})`
                        : ` (dentro de capacidad de ${result.contractedCapacity.toLocaleString("es-MX")})`}
                    </span>
                    <span>{currency.format(result.surgeReserve)}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.ratioBar}>
              <div className={styles.ratioLabel}>Relación {ratioLabel}</div>
              <div className={styles.ratioTrack}>
                <div className={styles.ratioFill} style={{ width: `${ratioFillPct}%` }} />
              </div>
            </div>

            <div className={styles.honestNote}>
              El ratio compara contra el techo legal; con aplicación débil, el motor real
              es el riesgo reputacional.
            </div>

            <div className={styles.saveRow}>
              {isAuthenticated ? (
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={handleSave}
                  disabled={saveState.status === "saving"}
                >
                  {saveState.status === "saving" ? "Guardando…" : "Guardar cotización"}
                </button>
              ) : (
                <p className={styles.saveHint}>
                  Inicia sesión con Google para guardar esta cotización.
                </p>
              )}
              {saveState.status === "saved" && (
                <span className={styles.saveSuccess}>
                  Cotización guardada.{" "}
                  <Link href={`/quotes/${saveState.quoteId}`}>Ver panel de casos →</Link>
                </span>
              )}
              {saveState.status === "error" && (
                <span className={styles.saveError}>{saveState.message}</span>
              )}
            </div>
          </>
        ) : (
          <p className={styles.placeholder}>
            Llena el formulario y calcula la cotización para ver la multa máxima y el plan
            de recuperación.
          </p>
        )}

        <div className={styles.lawyerNote}>
          Las cifras de multa son techos estatutarios de la LFPDPPP, no asesoría legal —
          verifica con un abogado.
        </div>
      </div>
    </div>
  );
}
