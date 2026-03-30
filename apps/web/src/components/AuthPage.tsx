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
          <h1 className={styles.title}>Loading access gate</h1>
          <p className={styles.subtitle}>Checking session and launch flags before opening the alpha entry.</p>
        </section>
        <section className={styles.card}>
          <p className={styles.helperText}>Preparing login surface...</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <p className={styles.kicker}>{copy.auth.brand}</p>
        <h1 className={styles.title}>Command the frontier through a closed alpha gate.</h1>
        <p className={styles.subtitle}>
          {registrationClosed
            ? "Access is provisioned by operators. Returning commanders can sign in, but public account creation stays locked during this alpha wave."
            : "This entry layer gives players a fast path into tasks, marches, inbox flow, and alliance coordination without changing the core strategy loop."}
        </p>

        {isClosedAlpha ? (
          <div className={styles.noticeBox}>
            <strong>Closed Alpha</strong>
            <span>Invite-only access, single-node live testing, and same-origin realtime are enabled for this build.</span>
          </div>
        ) : null}

        <div className={styles.journey}>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>01</span>
            <strong>Enter the city</strong>
            <p>{isClosedAlpha ? "Use the provisioned alpha credentials from the operator packet to enter the live province." : "Use a demo banner or a provisioned account to jump directly into a live province."}</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>02</span>
            <strong>Open the first tasks</strong>
            <p>The dashboard guides players through their first build, training, and research steps.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepIndex}>03</span>
            <strong>March onto the map</strong>
            <p>The command tray keeps scout, gather, and attack confirmation readable on both mobile and desktop.</p>
          </article>
        </div>

        <ul className={styles.highlights}>
          <li>Invite-only alpha onboarding</li>
          <li>Mobile-first HUD and bottom navigation</li>
          <li>March-first strategy flow</li>
          <li>Inbox and war council bridge</li>
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.modeBadge}>{isLogin ? "Login" : "Register"}</p>
          <h2 className={styles.cardTitle}>{isLogin ? copy.auth.loginTitle : copy.auth.registerTitle}</h2>
          <p className={styles.cardIntro}>
            {isLogin
              ? registrationClosed
                ? "Sign in with a provisioned alpha account to restore queues, marches, and alliance state."
                : "Return to your queues, marches, and active alliance state without losing momentum."
              : "Create a new account and open the first city operations through the tutorial chain."}
          </p>
        </div>

        {registrationClosed ? (
          <div className={styles.noticeBox}>
            <strong>Access Policy</strong>
            <span>Public signup is disabled. New commanders must be provisioned through the alpha operator workflow.</span>
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
            {authMutation.isPending ? "Working..." : isLogin ? copy.auth.login : copy.auth.register}
          </button>
        </form>

        {registrationClosed ? (
          <p className={styles.switchText}>Access is provisioned by operators during the current alpha wave.</p>
        ) : (
          <p className={styles.switchText}>
            {isLogin ? "Need a new account?" : "Already registered?"}{" "}
            <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Go to register" : "Back to login"}</Link>
          </p>
        )}
        {showDemoAccess ? (
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
                </div>
              ))}
            </div>
          </div>
        ) : isClosedAlpha ? (
          <div className={styles.demoBox}>
            <span className={styles.demoTitle}>Operator-provisioned access</span>
            <p className={styles.helperText}>
              Closed alpha accounts are created through the provisioning CLI and distributed out of band. Use the username and temporary password provided by the operator packet.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
