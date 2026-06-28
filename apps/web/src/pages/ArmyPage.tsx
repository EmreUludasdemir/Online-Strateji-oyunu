import { useMemo, useState } from "react";
import { type TroopType } from "@frontier/shared";
import { useGameLayoutContext } from "../components/GameLayout";
import { PageHero } from "../components/ui/PageHero";
import { Button } from "../components/ui/Button";
import { TimerChip } from "../components/ui/TimerChip";
import { Badge } from "../components/ui/Badge";
import { copy } from "../lib/i18n";
import { formatNumber } from "../lib/formatters";
import { useNow } from "../lib/useNow";

import styles from "./ArmyPage.module.css";

const TROOP_ICONS: Record<TroopType, string> = {
  INFANTRY: "⚔️",
  ARCHER: "🏹",
  CAVALRY: "🐎",
};

const TROOP_DESCRIPTIONS: Record<TroopType, string> = {
  INFANTRY: "Ağır zırhlı ve dayanıklı yakın dövüş birlikleri. Savunmada ustadırlar.",
  ARCHER: "Menzilli hasar ustaları. Sur savunmasında ve destek atışlarında etkilidirler.",
  CAVALRY: "Hızlı, çevik ve yıkıcı şok birlikleri. Harita üzerinde hızla hareket ederler.",
};

export function ArmyPage() {
  const now = useNow();
  const { state, train, isTraining, tutorialState, completeTutorialStep } = useGameLayoutContext();

  const [quantities, setQuantities] = useState<Record<TroopType, number>>({
    INFANTRY: 50,
    ARCHER: 50,
    CAVALRY: 50,
  });

  const handleSliderChange = (type: TroopType, value: number) => {
    setQuantities((prev) => ({ ...prev, [type]: value }));
  };

  const handleTrain = async (type: TroopType) => {
    if (quantities[type] > 0 && !state.city.activeTraining) {
      await train(type, quantities[type]);
      if (tutorialState?.currentStepId === "train_troops") {
        completeTutorialStep("train_troops");
      }
    }
  };

  const totalTroops = useMemo(() => {
    return state.city.troops.reduce((acc, t) => acc + t.quantity, 0);
  }, [state.city.troops]);

  const troopPercentages = useMemo(() => {
    if (totalTroops === 0) return { INFANTRY: 0, ARCHER: 0, CAVALRY: 0 };
    return {
      INFANTRY: Math.round(((state.city.troops.find((t) => t.type === "INFANTRY")?.quantity ?? 0) / totalTroops) * 100),
      ARCHER: Math.round(((state.city.troops.find((t) => t.type === "ARCHER")?.quantity ?? 0) / totalTroops) * 100),
      CAVALRY: Math.round(((state.city.troops.find((t) => t.type === "CAVALRY")?.quantity ?? 0) / totalTroops) * 100),
    };
  }, [state.city.troops, totalTroops]);

  const checkAffordability = (cost: Record<string, number>, qty: number) => {
    return Object.entries(cost).every(([resource, amount]) => {
      return (state.city.resources[resource as keyof typeof state.city.resources] ?? 0) >= amount * qty;
    });
  };

  const renderCost = (cost: Record<string, number>, qty: number) => {
    return (
      <div className={styles.costRow}>
        {Object.entries(cost).map(([resource, amount]) => {
          if (amount === 0) return null;
          const totalCost = amount * qty;
          const currentAmount = state.city.resources[resource as keyof typeof state.city.resources] ?? 0;
          const isAffordable = currentAmount >= totalCost;
          
          let icon = "📦";
          if (resource === "food") icon = "🌾";
          if (resource === "wood") icon = "🪵";
          if (resource === "stone") icon = "🪨";
          if (resource === "gold") icon = "💰";

          return (
            <div key={resource} className={`${styles.costItem} ${isAffordable ? styles.affordable : styles.expensive}`}>
              <span className={styles.costItemIcon}>{icon}</span>
              {formatNumber(totalCost)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <PageHero
        kicker="Stratejik Karargah"
        title="Kışla & Ordugah"
        lead="Obanın askeri gücünü yönet, yeni birlikler talim et ve kompozisyonunu dengele."
      >
        <div className={styles.heroContent}>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Toplam Asker</span>
              <span className={styles.heroStatValue}>{formatNumber(totalTroops)}</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Akın Gücü</span>
              <span className={styles.heroStatValue}>{formatNumber(state.city.attackPower)}</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatLabel}>Oba Kalkanı</span>
              <span className={styles.heroStatValue}>{formatNumber(state.city.defensePower)}</span>
            </div>
          </div>
        </div>
      </PageHero>

      <div className={styles.layout}>
        <div className={styles.troopGrid}>
          {state.city.troops.map((troop) => {
            const qty = quantities[troop.type];
            const canAfford = checkAffordability(troop.trainingCost, qty);
            const isBusy = !!state.city.activeTraining || isTraining;

            return (
              <div key={troop.type} className={styles.troopCard}>
                <div className={styles.troopHeader}>
                  <div className={styles.troopTitleGroup}>
                    <h3 className={styles.troopName}>{troop.label}</h3>
                    <p className={styles.troopDesc}>{TROOP_DESCRIPTIONS[troop.type]}</p>
                  </div>
                  <div className={styles.troopIconBox}>{TROOP_ICONS[troop.type]}</div>
                </div>

                <div className={styles.troopStats}>
                  <div className={styles.troopStatItem}>
                    <span>Saldırı</span>
                    <span>{troop.attack}</span>
                  </div>
                  <div className={styles.troopStatItem}>
                    <span>Savunma</span>
                    <span>{troop.defense}</span>
                  </div>
                  <div className={styles.troopStatItem}>
                    <span>Hız</span>
                    <span>{troop.speed}</span>
                  </div>
                  <div className={styles.troopStatItem}>
                    <span>Taşıma</span>
                    <span>{troop.carry}</span>
                  </div>
                </div>

                <div className={styles.sliderControl}>
                  <div className={styles.sliderHeader}>
                    <label>Talim Miktarı</label>
                    <span className={styles.sliderValue}>{formatNumber(qty)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="500"
                    value={qty}
                    onChange={(e) => handleSliderChange(troop.type, parseInt(e.target.value, 10))}
                    className={styles.sliderInput}
                    disabled={isBusy}
                  />
                </div>

                {renderCost(troop.trainingCost, qty)}

                <Button
                  variant="primary"
                  className={tutorialState?.currentStepId === "train_troops" && troop.type === "INFANTRY" ? "is-tutorial-active" : undefined}
                  data-tutorial-target={tutorialState?.currentStepId === "train_troops" && troop.type === "INFANTRY" ? "tutorial-target-barracks-train" : undefined}
                  onClick={() => handleTrain(troop.type)}
                  disabled={!canAfford || isBusy || qty < 1}
                >
                  {isBusy ? "Kuyruk Dolu" : !canAfford ? "Erzak Yetersiz" : "Talim Et"}
                </Button>
              </div>
            );
          })}
        </div>

        <div className={styles.queuePanel}>
          <div className={styles.queueCard}>
            <div className={styles.queueHeader}>
              <h3 className={styles.queueTitle}>Eğitim Kuyruğu</h3>
              <Badge tone={state.city.activeTraining ? "warning" : "success"}>
                {state.city.activeTraining ? "Çalışıyor" : "Boş"}
              </Badge>
            </div>

            <div className={styles.queueContent}>
              {state.city.activeTraining ? (
                <div className={styles.queueItem}>
                  <div className={styles.queueItemInfo}>
                    <span className={styles.queueItemName}>
                      {state.city.troops.find((t) => t.type === state.city.activeTraining?.troopType)?.label}
                    </span>
                    <span className={styles.queueItemCount}>
                      {formatNumber(state.city.activeTraining.quantity)} adet
                    </span>
                  </div>
                  <TimerChip endsAt={state.city.activeTraining.completesAt} now={now} />
                </div>
              ) : (
                <div style={{ color: "var(--color-on-surface-variant)", fontSize: "0.9rem", textAlign: "center", padding: "1rem 0" }}>
                  Yeni buyruk bekleniyor.
                </div>
              )}
            </div>
          </div>

          <div className={styles.queueCard}>
            <div className={styles.queueHeader}>
              <h3 className={styles.queueTitle}>Ordu Kompozisyonu</h3>
            </div>
            
            <div className={styles.compBars}>
              {state.city.troops.map((troop) => {
                const pct = troopPercentages[troop.type];
                return (
                  <div key={troop.type} className={styles.compBarRow}>
                    <span className={styles.compLabel}>{troop.label}</span>
                    <div className={styles.compBarTrack}>
                      <div 
                        className={`${styles.compBarFill} ${styles[troop.type.toLowerCase()]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.compValue}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {(totalTroops < 100 || state.city.resources.food < 1000) && (
            <div className={styles.tacticalWarning}>
              <span>⚠️</span>
              <div>
                <strong>Taktiksel Uyarı:</strong>
                <br />
                {totalTroops < 100 
                  ? "Ordu mevcudu çok düşük, çevredeki barbar tehditlerine karşı savunmasızız. Acilen talim başlatın."
                  : "Erzak depoları kritik seviyede. Sefere çıkmadan önce erzak tarlalarından hasat yapın."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
