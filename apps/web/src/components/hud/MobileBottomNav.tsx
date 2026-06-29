import { NavLink } from "react-router-dom";
import type { TutorialState } from "../../lib/tutorialFlow";
import { shouldHighlightTutorialTarget } from "../../lib/tutorialFlow";

import { copy } from "../../lib/i18n";
import styles from "../GameLayoutShell.module.css";

export function MobileBottomNav({ tutorialState }: { tutorialState?: TutorialState }) {
  const cityTarget = shouldHighlightTutorialTarget(tutorialState, "tutorial-target-nav-city");
  const mapTarget = shouldHighlightTutorialTarget(tutorialState, "tutorial-target-nav-map");
  const reportsTarget = shouldHighlightTutorialTarget(tutorialState, "tutorial-target-navigate-reports");

  return (
    <nav className={styles.mobileNav}>
      <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.dashboard}
      </NavLink>
      <NavLink
        to="/app/city"
        className={({ isActive }) => [
          isActive ? styles.mobileLinkActive : styles.mobileLink,
          cityTarget ? "is-tutorial-active" : "",
        ].filter(Boolean).join(" ")}
        data-tutorial-target={cityTarget ? "tutorial-target-nav-city" : undefined}
      >
        Şehir
      </NavLink>
      <NavLink
        to="/app/map"
        className={({ isActive }) => [
          isActive ? styles.mobileLinkActive : styles.mobileLink,
          mapTarget ? "is-tutorial-active" : "",
        ].filter(Boolean).join(" ")}
        data-tutorial-target={mapTarget ? "tutorial-target-nav-map" : undefined}
      >
        {copy.hud.map}
      </NavLink>
      <NavLink
        to="/app/reports"
        className={({ isActive }) => [
          isActive ? styles.mobileLinkActive : styles.mobileLink,
          reportsTarget ? "is-tutorial-active" : "",
        ].filter(Boolean).join(" ")}
        data-tutorial-target={reportsTarget ? "tutorial-target-navigate-reports" : undefined}
      >
        {copy.hud.reports}
      </NavLink>
      <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.alliance}
      </NavLink>
    </nav>
  );
}
