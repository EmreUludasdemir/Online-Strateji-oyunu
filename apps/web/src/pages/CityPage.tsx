import type { BuildingType, BuildingView, ResourceKey } from "@frontier/shared";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { buildingIcon } from "../components/ui/buildingIcons";
import { SectionHeaderBlock } from "../components/ui/CommandSurface";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import { TUTORIAL_STEPS } from "../lib/tutorialFlow";
import {
  canAfford,
  getAdvisorSuggestions,
  getBuildingBenefits,
  getMissingResources,
  getStorageCapacity,
  getUpgradeCost,
} from "../lib/balanceHelpers";
import { getBuildingMaxLevelByTownHall } from "../lib/balanceConfig";
import styles from "./CityPage.module.css";

const RESOURCE_KEYS: ResourceKey[] = ["wood", "stone", "food", "gold"];
/* ── Turkish Building Labels ─────────────────────────── */

const BUILDING_TR: Record<BuildingType, string> = {
  TOWN_HALL: "Kağan Otağı",
  BARRACKS: "Kışla",
  ACADEMY: "Bilge Ocağı",
  WATCHTOWER: "Gözcü Kulesi",
  FARM: "Erzak Tarlası",
  LUMBER_MILL: "Odunluk",
  QUARRY: "Taş Ocağı",
  GOLD_MINE: "Altın Madeni",
  HOSPITAL: "Şifahane",
  WALL: "Sur",
  EMBASSY: "Toy Çadırı",
  FORGE: "Demirci",
};

const BUILDING_TR_DESC: Record<BuildingType, string> = {
  TOWN_HALL: "Şehir seviyesini ve yapı sınırını belirler.",
  FARM: "Orduyu besleyen gıda üretir.",
  LUMBER_MILL: "Yapı yükseltmelerini taşıyan odun üretir.",
  QUARRY: "Savunma yapılarına güç veren taş üretir.",
  GOLD_MINE: "Araştırma ve seçkin emirler için altın üretir.",
  BARRACKS: "Birlik talim eder ve eğitim hızını artırır.",
  ACADEMY: "Uzun vadeli doktrin ve strateji çalışmaları açar.",
  WATCHTOWER: "Görüş alanını genişletir ve savunma katar.",
  HOSPITAL: "Savaştan dönen yaralı askerleri iyileştirir.",
  WALL: "Şehre ağır savunma katmanı ekler.",
  EMBASSY: "İttifak kapasitesini ve diplomatik koordinasyonu artırır.",
  FORGE: "Tüm birliklerin saldırı gücünü artırır.",
};

const RESOURCE_TR: Record<ResourceKey, string> = {
  wood: "Odun",
  stone: "Taş",
  food: "Gıda",
  gold: "Altın",
};

const RESOURCE_ICON: Record<ResourceKey, string> = {
  wood: "🪵",
  stone: "🪨",
  food: "🌾",
  gold: "💰",
};

/* ── Building bonus helper ───────────────────────────── */

function getBuildingBonus(type: BuildingType, level: number, city: { hospitalHealingCapacity: number; visionRadius: number }): string | null {
  switch (type) {
    case "HOSPITAL":
      return `Şifa: ${city.hospitalHealingCapacity}/tur`;
    case "WALL":
      return `Savunma: +${level * 40}`;
    case "FORGE":
      return `Saldırı: +${level * 4}%`;
    case "WATCHTOWER":
      return `Görüş: ${city.visionRadius} kare`;
    case "BARRACKS":
      return `Talim hızı: +${Math.max(0, level - 1) * 12}%`;
    case "FARM":
      return `Gıda/saat: +${level * 120}`;
    case "LUMBER_MILL":
      return `Odun/saat: +${level * 100}`;
    case "QUARRY":
      return `Taş/saat: +${level * 90}`;
    case "GOLD_MINE":
      return `Altın/saat: +${level * 60}`;
    default:
      return null;
  }
}

/* ── Tactical Insight ────────────────────────────────── */

function getDefenseInsight(defensePower: number, attackPower: number, wallLevel: number): { label: string; tone: "safe" | "warn" | "danger" } {
  const ratio = defensePower / Math.max(1, attackPower + defensePower);
  if (ratio > 0.5 && wallLevel >= 3) return { label: "Güvenli", tone: "safe" };
  if (ratio > 0.3) return { label: "Kuşatma Riski", tone: "warn" };
  return { label: "Savunma Zayıf", tone: "danger" };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm === 0 ? `${h}sa` : `${h}sa ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d}g` : `${d}g ${rh}sa`;
}

/* ── Building categories ─────────────────────────────── */

const BUILDING_CATEGORIES: { label: string; types: BuildingType[] }[] = [
  { label: "Yönetim", types: ["TOWN_HALL", "EMBASSY"] },
  { label: "Askeri", types: ["BARRACKS", "FORGE", "WALL", "WATCHTOWER", "HOSPITAL"] },
  { label: "Ekonomi", types: ["FARM", "LUMBER_MILL", "QUARRY", "GOLD_MINE"] },
  { label: "Bilim", types: ["ACADEMY"] },
];

/* ── Component ───────────────────────────────────────── */

export function CityPage() {
  const now = useNow();
  const navigate = useNavigate();
  const { state, upgrade, isUpgrading, tutorialState, completeTutorialStep } = useGameLayoutContext();
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType | null>(null);

  const city = state.city;
  const buildings = city.buildings;
  const activeUpgrade = city.activeUpgrade;
  const townHall = buildings.find((b) => b.type === "TOWN_HALL");
  const thLevel = townHall?.level ?? 1;
  const storageCapacity = getStorageCapacity(thLevel);
  const totalTroops = city.troops.reduce((sum, t) => sum + t.quantity, 0);
  const totalWounded = Object.values(city.woundedTroops).reduce((s, v) => s + v, 0);
  const wallBuilding = buildings.find((b) => b.type === "WALL");
  const wallLevel = wallBuilding?.level ?? 0;
  const defenseInsight = getDefenseInsight(city.defensePower, city.attackPower, wallLevel);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.type === selectedBuildingType) ?? null,
    [buildings, selectedBuildingType],
  );

  const canAffordUpgrade = (building: BuildingView): boolean => {
    return canAfford(city.resources, building.upgradeCost);
  };

  const getBuildingStatus = (building: BuildingView): { label: string; tone: "info" | "warning" | "danger" | "success" } => {
    if (building.isUpgradeActive) return { label: "Yükseltiliyor", tone: "info" };
    if (activeUpgrade && !building.isUpgradeActive) return { label: "Kuyruk Dolu", tone: "warning" };
    
    const maxLevel = getBuildingMaxLevelByTownHall(building.type, thLevel);
    if (building.level >= maxLevel && building.type !== "TOWN_HALL") return { label: `Otağ Sınırı (L${maxLevel})`, tone: "danger" };

    if (!canAffordUpgrade(building)) return { label: "Kaynak Yetersiz", tone: "danger" };
    return { label: "Hazır", tone: "success" };
  };

  const advisorSuggestions = useMemo<import("../lib/balanceHelpers").AdvisorSuggestion[]>(() => {
    if (tutorialState && !tutorialState.isSkipped && tutorialState.currentStepId !== "completed") {
      const step = TUTORIAL_STEPS[tutorialState.currentStepId];
      if (step?.advisorMessage) {
        return [{
          id: "tutorial",
          type: "URGENT",
          message: step.advisorMessage,
          actionLabel: "Yönerge",
        }];
      }
    }
    return getAdvisorSuggestions(city);
  }, [city, tutorialState]);

  const handleUpgrade = async (buildingType: BuildingType) => {
    await upgrade(buildingType);
    if (tutorialState?.currentStepId === "upgrade_townhall" && buildingType === "TOWN_HALL") {
      completeTutorialStep("upgrade_townhall");
    }
  };

  return (
    <section className={styles.page}>
      {/* ── City Header ──────────────────────────────── */}
      <header className={styles.cityHeader}>
        <div className={styles.cityHeaderTop}>
          <div>
            <h1 className={styles.cityName}>{city.cityName}</h1>
            <p className={styles.cityCoords}>
              Koordinat: {city.coordinates.x}, {city.coordinates.y}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Badge tone={city.peaceShieldUntil ? "info" : "warning"}>
              {city.peaceShieldUntil ? "Barış Kalkanı Aktif" : "Akına Açık"}
            </Badge>
            <Badge tone="info">Seviye {buildings.find((b) => b.type === "TOWN_HALL")?.level ?? 1}</Badge>
          </div>
        </div>
        <div className={styles.cityStatsRow}>
          <div className={styles.cityStat}>
            <span className={styles.cityStatLabel}>Saldırı Gücü</span>
            <span className={styles.cityStatValue}>{formatNumber(city.attackPower)}</span>
          </div>
          <div className={styles.cityStat}>
            <span className={styles.cityStatLabel}>Savunma Gücü</span>
            <span className={styles.cityStatValue}>{formatNumber(city.defensePower)}</span>
          </div>
          <div className={styles.cityStat}>
            <span className={styles.cityStatLabel}>Toplam Asker</span>
            <span className={styles.cityStatValue}>{formatNumber(totalTroops)}</span>
          </div>
          <div className={styles.cityStat}>
            <span className={styles.cityStatLabel}>Yaralı Asker</span>
            <span className={styles.cityStatValue}>{formatNumber(totalWounded)}</span>
          </div>
          <div className={styles.cityStat}>
            <span className={styles.cityStatLabel}>Açık Sefer</span>
            <span className={styles.cityStatValue}>{city.openMarchCount}</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ──────────────────────────────── */}
      <div className={styles.mainLayout}>
        {/* Left Column: Building Grid */}
        <div className={styles.leftCol}>
          {BUILDING_CATEGORIES.map((cat) => {
            const catBuildings = buildings.filter((b) => cat.types.includes(b.type));
            if (catBuildings.length === 0) return null;

            return (
              <section key={cat.label}>
                <div className={styles.sectionTitle}>
                  <div>
                    <span className={styles.sectionKicker}>{cat.label} Binaları</span>
                    <h2 className={styles.sectionHeading}>{cat.label}</h2>
                  </div>
                  <Badge tone="info">{catBuildings.length} yapı</Badge>
                </div>
                <div className={styles.buildingGrid} style={{ marginTop: "0.75rem" }}>
                  {catBuildings.map((building) => {
                    const status = getBuildingStatus(building);
                    const isSelected = selectedBuildingType === building.type;
                    const bonus = getBuildingBonus(building.type, building.level, city);
                    const isTutorialActiveForBuilding = tutorialState?.currentStepId === "upgrade_townhall" && building.type === "TOWN_HALL";

                    return (
                      <button
                        key={building.type}
                        type="button"
                        className={[
                          styles.buildingCard, 
                          isSelected ? styles.buildingCardSelected : "",
                          isTutorialActiveForBuilding ? "is-tutorial-active" : ""
                        ].filter(Boolean).join(" ")}
                        data-tutorial-target={isTutorialActiveForBuilding ? "tutorial-target-townhall-upgrade" : undefined}
                        onClick={() => setSelectedBuildingType(isSelected ? null : building.type)}
                        aria-pressed={isSelected}
                      >
                        <div className={styles.buildingCardHead}>
                          <img
                            src={buildingIcon(building.type)}
                            alt=""
                            className={styles.buildingIcon}
                            loading="lazy"
                          />
                          <div className={styles.buildingCardMeta}>
                            <h3 className={styles.buildingName}>{BUILDING_TR[building.type] ?? building.label}</h3>
                            <span className={styles.buildingLevel}>Seviye {building.level}</span>
                          </div>
                        </div>
                        <div className={styles.buildingStatusRow}>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {bonus && <span className={styles.buildingBonusMicro}>{bonus}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* Right Column: Details & Advisor */}
        <div className={styles.rightCol}>
          {/* ── Building Detail Panel ────────────────────────── */}
          {selectedBuilding && (
            <div className={styles.buildingDetailPanel}>
              <SectionHeaderBlock kicker="Yapı Detayı" title="Yükseltme Buyruğu" />
              
              <div className={styles.detailHeadRow}>
                <img
                  src={buildingIcon(selectedBuilding.type)}
                  alt=""
                  className={styles.detailIcon}
                  loading="lazy"
                />
                <div className={styles.detailHeadMeta}>
                  <h3 className={styles.detailName}>
                    {BUILDING_TR[selectedBuilding.type] ?? selectedBuilding.label}
                  </h3>
                  <p className={styles.detailDescText}>
                    {BUILDING_TR_DESC[selectedBuilding.type] ?? selectedBuilding.description}
                  </p>
                </div>
              </div>

              <div className={styles.detailStatsGrid}>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatLabel}>Mevcut Seviye</span>
                  <span className={styles.detailStatValue}>L{selectedBuilding.level}</span>
                </div>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatLabel}>Hedef Seviye</span>
                  <span className={styles.detailStatValue}>L{selectedBuilding.nextLevel}</span>
                </div>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatLabel}>Süre</span>
                  <span className={styles.detailStatValue}>
                    {formatDuration(selectedBuilding.upgradeDurationSeconds)}
                  </span>
                </div>
              </div>

              <div style={{ padding: "0.85rem", background: "var(--color-surface-container-highest)", borderRadius: "var(--radius-xs)" }}>
                <span className={styles.detailStatLabel} style={{ marginBottom: "0.35rem" }}>Kazanılacak Avantaj (L{selectedBuilding.nextLevel})</span>
                <p className={styles.detailDescText} style={{ color: "var(--color-primary-fixed)" }}>
                  {getBuildingBenefits(selectedBuilding.type, selectedBuilding.nextLevel) || "Şehrin genel gelişimine katkı sağlar."}
                </p>
              </div>

              <div>
                <span className={styles.sectionKicker} style={{ marginBottom: "0.5rem", display: "block" }}>
                  Yükseltme Maliyeti
                </span>
                <div className={styles.detailCostGrid}>
                  {RESOURCE_KEYS.map((key) => {
                    const cost = selectedBuilding.upgradeCost[key];
                    const has = city.resources[key];
                    const sufficient = has >= cost;

                    return (
                      <div
                        key={key}
                        className={[styles.costChip, sufficient ? styles.costSufficient : styles.costInsufficient].join(
                          " ",
                        )}
                      >
                        <span>{RESOURCE_TR[key]}</span>
                        <strong>{formatNumber(cost)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.detailActions}>
                <Button
                  type="button"
                  variant="primary"
                  data-tutorial-target={tutorialState?.currentStepId === "upgrade_townhall" && selectedBuilding.type === "TOWN_HALL" ? "tutorial-target-townhall-upgrade" : undefined}
                  className={tutorialState?.currentStepId === "upgrade_townhall" && selectedBuilding.type === "TOWN_HALL" ? "is-tutorial-active" : undefined}
                  onClick={() => handleUpgrade(selectedBuilding.type)}
                  disabled={
                    isUpgrading ||
                    Boolean(activeUpgrade) ||
                    !canAffordUpgrade(selectedBuilding)
                  }
                >
                  {activeUpgrade
                    ? "Kuyruk Dolu"
                    : !canAffordUpgrade(selectedBuilding)
                      ? "Kaynak Yetersiz"
                      : `L${selectedBuilding.nextLevel} Yükselt`}
                </Button>
                {selectedBuilding.type === "BARRACKS" && (
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => navigate("/app/army")}
                    data-tutorial-target={tutorialState?.currentStepId === "train_troops" ? "tutorial-target-barracks-train" : undefined}
                    className={tutorialState?.currentStepId === "train_troops" ? "is-tutorial-active" : undefined}
                  >
                    Ordu Sayfası
                  </Button>
                )}
                {selectedBuilding.type === "ACADEMY" && (
                  <Button type="button" variant="secondary" onClick={() => navigate("/app/research")}>
                    Araştırma Sayfası
                  </Button>
                )}
                {selectedBuilding.type === "EMBASSY" && (
                  <Button type="button" variant="secondary" onClick={() => navigate("/app/alliance")}>
                    İttifak Sayfası
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── Economy Panel ────────────────────────── */}
          <div className={styles.economyPanel}>
            <SectionHeaderBlock kicker="Hazine" title="Kaynak Durumu" lead="Anlık stok" />
            
            <div style={{ marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-outline)", marginBottom: "0.25rem" }}>
                <span>Depo Kapasitesi (Otağ L{thLevel})</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatNumber(storageCapacity)} Max</span>
              </div>
            </div>

            {RESOURCE_KEYS.map((key) => {
              const amount = city.resources[key];
              const pct = Math.min(100, Math.max(0, (amount / storageCapacity) * 100));
              const isWarning = pct > 90;
              
              return (
                <div key={key} className={styles.resourceRow} style={{ position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, bottom: 0, height: "3px", background: isWarning ? "var(--color-error)" : "var(--color-primary-fixed-dim)", width: `${pct}%`, transition: "width 0.3s" }} />
                  <span className={styles.resourceIcon}>{RESOURCE_ICON[key]}</span>
                  <span className={styles.resourceName}>{RESOURCE_TR[key]}</span>
                  <span className={styles.resourceAmount} style={{ color: isWarning ? "var(--color-error)" : "var(--color-primary-fixed)" }}>{formatNumber(amount)}</span>
                </div>
              );
            })}
          </div>

          {/* ── Advisor Panel ────────────────────────── */}
          {advisorSuggestions.length > 0 && (
            <div className={styles.advisorPanel}>
              <SectionHeaderBlock kicker="Divan" title="Stratejik Danışman" lead="Öncelikli Aksiyonlar" />
              <div className={styles.advisorList}>
                {advisorSuggestions.map(s => (
                  <div key={s.id} className={[styles.advisorItem, s.type === "URGENT" ? styles.advisorItemUrgent : s.type === "ARMY" ? styles.advisorItemArmy : styles.advisorItemEconomy].filter(Boolean).join(" ")}>
                    <span className={styles.advisorIcon}>{s.type === "URGENT" ? "🚨" : s.type === "ARMY" ? "⚔️" : s.type === "ECONOMY" ? "🌾" : "💡"}</span>
                    <div className={styles.advisorContent}>
                      <p className={styles.advisorMessage}>{s.message}</p>
                      <button 
                        type="button"
                        onClick={() => {
                          if (s.actionRoute) navigate(s.actionRoute);
                          if (s.actionBuilding) setSelectedBuildingType(s.actionBuilding);
                        }}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--color-primary-fixed)", fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase", cursor: "pointer", textAlign: "left", alignSelf: "flex-start", marginTop: "0.25rem" }}>
                        {s.actionLabel} →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Defense Panel ────────────────────────── */}
          <div className={styles.defensePanel}>
            <SectionHeaderBlock kicker="Savunma" title="Şehir Kalkanı" lead="Durumu" />
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <span
                className={[
                  styles.defenseBadge,
                  defenseInsight.tone === "safe"
                    ? styles.defenseSafe
                    : defenseInsight.tone === "warn"
                      ? styles.defenseWarn
                      : styles.defenseDanger,
                ].join(" ")}
              >
                {defenseInsight.tone === "safe" ? "🛡️" : defenseInsight.tone === "warn" ? "⚠️" : "🔴"}{" "}
                {defenseInsight.label}
              </span>
              {city.peaceShieldUntil && <Badge tone="info">Barış Kalkanı</Badge>}
            </div>
            <div className={styles.defenseStatRow}>
              <div className={styles.cityStat}>
                <span className={styles.cityStatLabel}>Sur Seviyesi</span>
                <span className={styles.cityStatValue}>L{wallLevel}</span>
              </div>
              <div className={styles.cityStat}>
                <span className={styles.cityStatLabel}>Savunma</span>
                <span className={styles.cityStatValue}>{formatNumber(city.defensePower)}</span>
              </div>
              <div className={styles.cityStat}>
                <span className={styles.cityStatLabel}>Garnizon</span>
                <span className={styles.cityStatValue}>{formatNumber(totalTroops)}</span>
              </div>
              <div className={styles.cityStat}>
                <span className={styles.cityStatLabel}>Şifa Kapasitesi</span>
                <span className={styles.cityStatValue}>{city.hospitalHealingCapacity}/tur</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button type="button" variant="secondary" onClick={() => navigate("/app/army")}>
                Ordu Yönet
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate("/app/map")}>
                Haritaya Dön
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
