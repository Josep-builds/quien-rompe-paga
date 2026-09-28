import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./quotes.module.css";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default async function QuotesListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, records_affected, sensitive_data, plan_total, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.backLink}>
        ← Cotizador
      </Link>
      <h1 className={styles.title}>Mis cotizaciones</h1>

      {!quotes || quotes.length === 0 ? (
        <p className={styles.empty}>Aún no guardas ninguna cotización.</p>
      ) : (
        <ul className={styles.list}>
          {quotes.map((q) => (
            <li key={q.id} className={styles.item}>
              <Link href={`/quotes/${q.id}`} className={styles.itemLink}>
                <span>
                  {q.records_affected.toLocaleString("es-MX")} registros
                  {q.sensitive_data ? " · sensibles" : ""}
                </span>
                <span>{currency.format(q.plan_total)}</span>
                <span className={styles.itemDate}>
                  {new Date(q.created_at).toLocaleDateString("es-MX")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
