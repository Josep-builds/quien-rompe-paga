import styles from "./page.module.css";
import { QuoteCalculator } from "@/components/QuoteCalculator";
import { signInWithGoogle, signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quien Rompe, Paga</h1>
        <div className={styles.authBar}>
          {user ? (
            <form action={signOut} className={styles.authForm}>
              <span className={styles.authEmail}>{user.email}</span>
              <button type="submit" className={styles.authButton}>
                Cerrar sesión
              </button>
            </form>
          ) : (
            <form action={signInWithGoogle}>
              <button type="submit" className={styles.authButton}>
                Iniciar sesión con Google
              </button>
            </form>
          )}
        </div>
        <span className={styles.badge}>DATOS SIMULADOS · cifras ilustrativas</span>
      </div>
      <p className={styles.subtitle}>
        Cotización de recuperación de víctimas para empresas con una brecha de datos.
      </p>

      <QuoteCalculator />
    </main>
  );
}
