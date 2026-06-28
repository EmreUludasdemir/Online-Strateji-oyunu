import { NavLink } from "react-router-dom";
import type { TutorialState } from "../../lib/tutorialFlow";

import { copy } from "../../lib/i18n";
import styles from "../GameLayoutShell.module.css";

export function MobileBottomNav({ tutorialState }: { tutorialState?: TutorialState }) {
  return (
    <nav className={styles.mobileNav}>
      <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.dashboard}
      </NavLink>
      <NavLink to="/app/city" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        Şehir
      </NavLink>
      <NavLink
        to="/app/map"
        className={({ isActive }) => [
          isActive ? styles.mobileLinkActive : styles.mobileLink,
          tutorialState?.currentStepId === "navigate_map" ? "is-tutorial-active" : ""
        ].filter(Boolean).join(" ")}
        data-tutorial-target={tutorialState?.currentStepId === "navigate_map" ? "tutorial-target-nav-map" : undefined}
      >
        {copy.hud.map}
      </NavLink>
      <NavLink
        to="/app/reports"
        className={({ isActive }) => [
          isActive ? styles.mobileLinkActive : styles.mobileLink,
          tutorialState?.currentStepId === "read_report" ? "is-tutorial-active" : ""
        ].filter(Boolean).join(" ")}
        data-tutorial-target={tutorialState?.currentStepId === "read_report" ? "tutorial-target-navigate-reports" : undefined}
      >
        {copy.hud.reports}
      </NavLink>
      <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.alliance}
      </NavLink>
    </nav>
  );
}
