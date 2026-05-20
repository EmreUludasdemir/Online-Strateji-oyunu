import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { api, ApiClientError } from "../api";
import { usePublicBootstrap } from "../lib/bootstrap";
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

  const bootstrapQuery = usePublicBootstrap();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.session,
    retry: false,
  });

  const registrationClosed = bootstrapQuery.data?.registrationMode === "login_only";
  const isClosedAlpha = bootstrapQuery.data?.launchPhase === "closed_alpha";
  const isLogin = mode === "login";
  const showDemoAccess = isLogin && !isClosedAlpha;

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

  if (!bootstrapQuery.isPending && registrationClosed && !isLogin) {
    return <Navigate to="/login" replace />;
  }

  const error = authMutation.error instanceof ApiClientError ? authMutation.error : null;
  const bootstrapError = bootstrapQuery.error instanceof ApiClientError ? bootstrapQuery.error : null;

  if (sessionQuery.isPending || bootstrapQuery.isPending) {
    return (
      <main className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.kicker}>{copy.auth.brand}</p>
          <h1 className={styles.title}>Otağ kapısı açılıyor</h1>
          <p className={styles.subtitle}>Oturum ve sefer işaretleri okunuyor, alpha kapısı hazırlanıyor.</p>
        </section>
        <section className={styles.card}>
          <p className={styles.helperText}>Giriş otağı hazırlanıyor...</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>{copy.auth.brand}</p>
        <h1 className={styles.title}>Kapalı alpha kapısından bozkırı yönet.</h1>
        <p className={styles.subtitle}>
          {registrationClosed
            ? "Erişim kağan kâtipleri tarafından verilir. Eski başbuğlar geri dönebilir, ama yeni hesap bu dalga süresince kilitli kalır."
            : "Bu giriş katmanı oyuncuya buyruk zinciri, sefer, ulak hattı ve toy düzenine hızlı yol açar; ana strateji halkasını değiştirmez."}
        </p>

        {isClosedAlpha ? (
          <div className={styles.noticeBox}>
            <strong>Kapalı Alpha</strong>
            <span>Davetli erişim, tek düğüm canlı sınama ve aynı kökende anlık iletişim bu sürümde açık.</span>
          </div>
        ) : null}

        <div className={styles.journey}>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>01</span>
            <strong>Oba'ya gir</strong>
            <p>{isClosedAlpha ? "Operatör paketinden gelen alpha kimliğiyle canlı obaya gir." : "Demo sancağı veya verilmiş hesapla canlı obaya doğrudan atla."}</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>02</span>
            <strong>İlk buyrukları aç</strong>
            <p>Oba merkezi oyuncuyu ilk yapı, talim ve töre adımlarına götürür.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>03</span>
            <strong>Bozkıra sefer aç</strong>
            <p>Komut tepsisi keşif, yağma ve akın onayını mobil ile masaüstünde okunur tutar.</p>
          </article>
        </div>

        <ul className={styles.highlights}>
          <li>Davetli alpha açılışı</li>
          <li>Mobil-öncelikli HUD ve alt navigasyon</li>
          <li>Sefer-odaklı strateji halkası</li>
          <li>Ulak odası ile savaş divanı köprüsü</li>
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.modeBadge}>{isLogin ? "Giriş" : "Kayıt"}</p>
          <h2 className={styles.cardTitle}>{isLogin ? copy.auth.loginTitle : copy.auth.registerTitle}</h2>
          <p className={styles.cardIntro}>
            {isLogin
              ? registrationClosed
                ? "Verilmiş bir alpha hesabıyla gir; kuyruklar, seferler ve toy durumu yerine döner."
                : "Kuyruklarına, seferlerine ve toy durumuna momentum kaybetmeden geri dön."
              : "Yeni bir hesap kur ve ilk oba buyruklarını rehber zincirinden aç."}
          </p>
        </div>

        {registrationClosed ? (
          <div className={styles.noticeBox}>
            <strong>Kapı Töresi</strong>
            <span>Açık kayıt kapalı. Yeni başbuğlar alpha operatör akışıyla atanır.</span>
          </div>
        ) : null}

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
              placeholder="commander_01"
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
              placeholder="At least 8 characters"
            />
          </label>

          {bootstrapError ? (
            <div className={styles.errorBox}>
              <strong>{bootstrapError.message}</strong>
              {bootstrapError.details.length > 0 ? <span>{bootstrapError.details.join(" ")}</span> : null}
            </div>
          ) : null}

          {error ? (
            <div className={styles.errorBox}>
              <strong>{error.message}</strong>
              {error.details.length > 0 ? <span>{error.details.join(" ")}</span> : null}
            </div>
          ) : null}

          <button className={styles.submitButton} type="submit" disabled={authMutation.isPending || Boolean(bootstrapError)}>
            {authMutation.isPending ? "İşleniyor..." : isLogin ? copy.auth.login : copy.auth.register}
          </button>
        </form>

        {registrationClosed ? (
          <p className={styles.switchText}>Bu alpha dalgasında erişim operatörler tarafından verilir.</p>
        ) : (
          <p className={styles.switchText}>
            {isLogin ? "Yeni hesap mı?" : "Zaten kayıtlı mısın?"}{" "}
            <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Kayıt ekranına geç" : "Giriş ekranına dön"}</Link>
          </p>
        )}
        {showDemoAccess ? (
          <div className={styles.demoBox}>
            <span className={styles.demoTitle}>Hazır demo sancakları</span>
            <p className={styles.helperText}>
              Tüm demo başbuğlarının ortak parolası <code>demo12345</code>
            </p>
            <div className={styles.demoList}>
              {demoUsers.map((demoUser) => (
                <div key={demoUser} className={styles.demoRow}>
                  <div>
                    <strong>{demoUser}</strong>
                    <p>Ekilmiş oba, toy ve sefer verisiyle açılır.</p>
                  </div>
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
                    {copy.auth.login}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : isClosedAlpha ? (
          <div className={styles.demoBox}>
            <span className={styles.demoTitle}>Operatör destekli erişim</span>
            <p className={styles.helperText}>
              Kapalı alpha hesapları sağlama CLI'ı üzerinden açılır ve operatör paketleriyle dağıtılır. Pakette gelen kullanıcı adı ve geçici parolayı kullan.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
