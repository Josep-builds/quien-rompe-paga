"use client";

import { FormEvent, useState } from "react";
import styles from "./verificar.module.css";
import { computeCurpHash, hashPrefix } from "@/lib/curpHash";

const DEMO_CURPS = ["SIML800101HDFRRL01", "GARC850315MDFRNL02", "HERZ920730HDFRRC09"];

const FIVE_MOVES = [
  "Congela temporalmente tu reporte en las sociedades de información crediticia.",
  "Activa alertas de nuevas cuentas o créditos en tu banco y en CONDUSEF.",
  "Levanta una denuncia por posible robo de identidad y guarda el folio.",
  "Revisa tu Buró de Crédito (reporte gratuito una vez al año) por cuentas que no reconozcas.",
  "Cambia las contraseñas de tus cuentas financieras y activa doble factor de autenticación.",
];

type LookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; found: boolean }
  | { status: "error"; message: string };

export default function VerificarPage() {
  const [partnerVerified, setPartnerVerified] = useState(false);
  const [curp, setCurp] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (curp.trim().length === 0) {
      setLookup({ status: "error", message: "Escribe una CURP." });
      return;
    }

    setLookup({ status: "checking" });
    try {
      const hash = await computeCurpHash(curp);
      const prefix = hashPrefix(hash);

      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix }),
      });

      if (!response.ok) {
        setLookup({ status: "error", message: "No se pudo completar la verificación." });
        return;
      }

      const { hashes } = (await response.json()) as { hashes: string[] };
      const found = hashes.includes(hash);
      setLookup({ status: "done", found });
    } catch {
      setLookup({ status: "error", message: "No se pudo completar la verificación." });
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Verificación de víctima</h1>
        <span className={styles.badge}>DATOS SIMULADOS</span>
      </div>

      {!partnerVerified ? (
        <div className={styles.gate}>
          <p className={styles.gateText}>
            Este enlace fue publicado por un socio de confianza. Antes de continuar, confirma tu
            identidad a través del socio.
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => setPartnerVerified(true)}
          >
            Verificación con socio (SIMULADA)
          </button>
          <p className={styles.hint}>
            Este botón no verifica una identidad real — es un paso simulado para la demo.
          </p>
        </div>
      ) : (
        <>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label htmlFor="curp" className={styles.label}>
              CURP
            </label>
            <input
              id="curp"
              type="text"
              value={curp}
              onChange={(e) => setCurp(e.target.value)}
              placeholder="Escribe tu CURP"
              className={styles.input}
              maxLength={30}
            />
            <button
              type="submit"
              className={styles.button}
              disabled={lookup.status === "checking"}
            >
              {lookup.status === "checking" ? "Verificando…" : "Verificar"}
            </button>
          </form>

          <div className={styles.demoBox}>
            <p className={styles.demoLabel}>CURP de prueba — inventada</p>
            <ul className={styles.demoList}>
              {DEMO_CURPS.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ul>
          </div>

          {lookup.status === "error" && <div className={styles.error}>{lookup.message}</div>}

          {lookup.status === "done" && (
            <div className={styles.result}>
              <p className={styles.resultHeadline}>
                {lookup.found
                  ? "Sí, tus datos aparecen en esta brecha (SIMULADA)."
                  : "No encontramos tu CURP en esta brecha (SIMULADA)."}
              </p>
              <p className={styles.resultSub}>
                {lookup.found
                  ? "Esto es lo que puedes hacer:"
                  : "Aun así, esto es lo que puedes hacer para protegerte:"}
              </p>
              <ol className={styles.moves}>
                {FIVE_MOVES.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </main>
  );
}
