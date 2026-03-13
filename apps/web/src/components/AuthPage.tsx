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
        <h1 className={styles.title}>Run a frontier province from browser tab to battle map.</h1>
        <p className={styles.subtitle}>
          This entry layer gives players a fast path into tasks, marches, inbox flow, and alliance coordination
          without changing the core strategy loop.
        </p>

        <div className={styles.journey}>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>01</span>
            <strong>Enter the city</strong>
            <p>Use a demo banner or your own account to jump directly into a live province.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>02</span>
            <strong>Open the first tasks</strong>
            <p>The dashboard guides players through their first build, training, and research steps.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>03</span>
            <strong>March onto the map</strong>
            <p>The two-step target sheet lets players scout, gather, or attack with clear confirmation.</p>
          </article>
        </div>

        <ul className={styles.highlights}>
          <li>Mobile-first HUD and bottom navigation</li>
          <li>March-first strategy flow</li>
          <li>Inbox and report center</li>
          <li>Alliance coordination and help board</li>
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.modeBadge}>{isLogin ? "Login" : "Register"}</p>
          <h2 className={styles.cardTitle}>{isLogin ? copy.auth.loginTitle : copy.auth.registerTitle}</h2>
          <p className={styles.cardIntro}>
            {isLogin
              ? "Return to your queues, marches, and active alliance state without losing momentum."
              : "Create a new account and open the first city operations through the tutorial chain."}
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

          {error ? (
            <div className={styles.errorBox}>
              <strong>{error.message}</strong>
              {error.details.length > 0 ? <span>{error.details.join(" ")}</span> : null}
            </div>
          ) : null}

          <button className={styles.submitButton} type="submit" disabled={authMutation.isPending}>
            {authMutation.isPending ? "Working..." : isLogin ? copy.auth.login : copy.auth.register}
          </button>
        </form>

        <p className={styles.switchText}>
          {isLogin ? "Need a new account?" : "Already registered?"}{" "}
          <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Go to register" : "Back to login"}</Link>
        </p>

        <div className={styles.demoBox}>
          <span className={styles.demoTitle}>Ready demo banners</span>
          <p className={styles.helperText}>
            The shared password for every demo commander is <code>demo12345</code>
          </p>
          <div className={styles.demoList}>
            {demoUsers.map((demoUser) => (
              <div key={demoUser} className={styles.demoRow}>
                <div>
                  <strong>{demoUser}</strong>
                  <p>Opens with seeded city, alliance, and march data.</p>
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
                    Log in
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
