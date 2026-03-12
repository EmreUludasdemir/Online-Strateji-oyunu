import { NavLink } from "react-router-dom";

import { copy } from "../../lib/i18n";
import styles from "../GameLayoutShell.module.css";

export function MobileBottomNav() {
  return (
    <nav className={styles.mobileNav}>
      <NavLink to="/app/dashboard" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.dashboard}
      </NavLink>
      <NavLink to="/app/map" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.map}
      </NavLink>
      <NavLink to="/app/reports" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.reports}
      </NavLink>
      <NavLink to="/app/alliance" className={({ isActive }) => (isActive ? styles.mobileLinkActive : styles.mobileLink)}>
        {copy.hud.alliance}
      </NavLink>
    </nav>
  );
}
