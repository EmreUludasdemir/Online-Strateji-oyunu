import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { api, ApiClientError } from "../api";
import { copy } from "../lib/i18n";
import styles from "./AuthPage.module.css";

interface AuthPageProps {
  mode: "login" | "register";
}

const demoUsers = ["demo_alpha", "demo_beta", "demo_gamma"];

export function AuthPage({ mode }: AuthPageProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    retry: false,
  });

  const authMutation = useMutation({
    mutationFn: (payload: { username: string; password: string }) =>
      mode === "login" ? api.login(payload) : api.register(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
      navigate("/app/dashboard", { replace: true });
    },
  });

  if (sessionQuery.data?.user) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const error = authMutation.error instanceof ApiClientError ? authMutation.error : null;
  const isLogin = mode === "login";

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>{copy.auth.brand}</p>
        <h1 className={styles.title}>Tarayicidan yonetilen bir sinir eyaletini sehirden atlasa tasiyin.</h1>
        <p className={styles.subtitle}>
          Bu giris katmani, gorev zinciri, harita seferleri, ulak kutusu ve ittifak koordinasyonu icin hizli
          bir baslangic noktasi sunar.
        </p>

        <div className={styles.journey}>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>01</span>
            <strong>Sehre gir</strong>
            <p>Demo sancaklardan biriyle ya da kendi hesabinizla aninda iceri alin.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>02</span>
            <strong>Ilk gorevi ac</strong>
            <p>Dashboard sizi ilk insa, talim ve arastirma zincirine yonlendirir.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>03</span>
            <strong>Atlasa cik</strong>
            <p>Iki asamali hedef sheeti ile kamp, node ya da sehir secip sefer cikarirsiniz.</p>
          </article>
        </div>

        <ul className={styles.highlights}>
          <li>Mobil-odakli hud ve alt gezinme</li>
          <li>March merkezli harita akisi</li>
          <li>Ulak kutusu ve sefer defteri</li>
          <li>Ittifak odasi ve yardim panosu</li>
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.modeBadge}>{isLogin ? "Giris" : "Kayit"}</p>
          <h2 className={styles.cardTitle}>{isLogin ? copy.auth.loginTitle : copy.auth.registerTitle}</h2>
          <p className={styles.cardIntro}>
            {isLogin
              ? "Komuta paneline donun, aktif kuyruklarinizi ve saha emirlerinizi kaldiginiz yerden surdurun."
              : "Yeni bir komutan olusturun ve ilk sehir operasyonlarinizi gorev zinciri ile acin."}
          </p>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate({ username, password });
          }}
        >
          <label className={styles.field}>
            <span>{copy.auth.username}</span>
            <input
              required
              minLength={3}
              maxLength={24}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="komutan_01"
            />
          </label>

          <label className={styles.field}>
            <span>{copy.auth.password}</span>
            <input
              required
              minLength={8}
              maxLength={72}
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="En az 8 karakter"
            />
          </label>

          {error ? (
            <div className={styles.errorBox}>
              <strong>{error.message}</strong>
              {error.details.length > 0 ? <span>{error.details.join(" ")}</span> : null}
            </div>
          ) : null}

          <button className={styles.submitButton} type="submit" disabled={authMutation.isPending}>
            {authMutation.isPending ? "Isleniyor..." : isLogin ? copy.auth.login : copy.auth.register}
          </button>
        </form>

        <p className={styles.switchText}>
          {isLogin ? "Yeni bir hesap mi gerekiyor?" : "Zaten kayitli misiniz?"}{" "}
          <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Kayit ekranina gec" : "Giris ekranina don"}</Link>
        </p>

        <div className={styles.demoBox}>
          <span className={styles.demoTitle}>Hazir demo sancaklari</span>
          <p className={styles.helperText}>Sifre butun demo komutanlari icin ayni: <code>demo12345</code></p>
          <div className={styles.demoList}>
            {demoUsers.map((demoUser) => (
              <div key={demoUser} className={styles.demoRow}>
                <div>
                  <strong>{demoUser}</strong>
                  <p>Hazir sehir, ittifak ve sefer verisi ile acilir.</p>
                </div>
                {isLogin ? (
                  <button
                    className={styles.demoButton}
                    data-demo-login={demoUser}
                    type="button"
                    disabled={authMutation.isPending}
                    onClick={() =>
                      authMutation.mutate({
                        username: demoUser,
                        password: "demo12345",
                      })
                    }
                  >
                    Giris yap
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

