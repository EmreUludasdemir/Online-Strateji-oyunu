import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { api, ApiClientError } from "../api";
import styles from "./AuthPage.module.css";

interface AuthPageProps {
  mode: "login" | "register";
}

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

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Frontier Dominion</p>
        <h1 className={styles.title}>Command a growing frontier city from a browser tab.</h1>
        <p className={styles.subtitle}>
          Gather supplies, expand civic districts, scout nearby settlements, and launch disciplined raids
          from a fully server-authoritative strategy MVP.
        </p>
        <ul className={styles.highlights}>
          <li>Server-timed resource growth</li>
          <li>Single-slot building upgrades</li>
          <li>Interactive world map with Phaser</li>
          <li>Persistent battle reports</li>
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {mode === "login" ? "Return to your command tent" : "Claim a frontier hold"}
        </h2>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate({ username, password });
          }}
        >
          <label className={styles.field}>
            <span>Username</span>
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
            <span>Password</span>
            <input
              required
              minLength={8}
              maxLength={72}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            {authMutation.isPending
              ? "Submitting..."
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>

        <p className={styles.switchText}>
          {mode === "login" ? "Need a new account?" : "Already registered?"}{" "}
          <Link to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Register here" : "Log in"}
          </Link>
        </p>

        <div className={styles.demoBox}>
          <span>Demo users:</span>
          <code>demo_alpha / demo12345</code>
          <code>demo_beta / demo12345</code>
          <code>demo_gamma / demo12345</code>
          {mode === "login" ? (
            <div className={styles.demoActions}>
              {["demo_alpha", "demo_beta", "demo_gamma"].map((demoUser) => (
                <button
                  key={demoUser}
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
                  Enter as {demoUser}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
