import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type BuildingType, type ResearchType, type TroopType } from "@frontier/shared";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ResourcePill } from "../components/ui/ResourcePill";
import { SectionCard } from "../components/ui/SectionCard";
import { TimerChip } from "../components/ui/TimerChip";
import { trackAnalyticsOnce } from "../lib/analytics";
import { copy } from "../lib/i18n";
import { formatNumber } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const now = useNow();
  const queryClient = useQueryClient();
  const {
    state,
    upgrade,
    train,
    research,
    openCommanderPanel,
    openInbox,
    openStorePreview,
    isUpgrading,
    isTraining,
    isResearching,
  } = useGameLayoutContext();
  const [selectedTroopType, setSelectedTroopType] = useState<TroopType>("INFANTRY");
  const [trainingQuantity, setTrainingQuantity] = useState(12);

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const inventoryQuery = useQuery({ queryKey: ["inventory"], queryFn: api.inventory });
  const mailboxQuery = useQuery({ queryKey: ["mailbox"], queryFn: api.mailbox });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events });
  const storeCatalogQuery = useQuery({ queryKey: ["store-catalog"], queryFn: api.storeCatalog });

  const claimTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.claimTask(taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
        queryClient.invalidateQueries({ queryKey: ["events"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  const useItemMutation = useMutation({
    mutationFn: api.useInventoryItem,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
      ]);
    },
  });

  const tutorialTasks = tasksQuery.data?.tutorial ?? [];
  const dailyTasks = tasksQuery.data?.daily ?? [];
  const inventoryItems = inventoryQuery.data?.items ?? [];
  const mailboxEntries = mailboxQuery.data?.entries ?? [];
  const seasonPass = eventsQuery.data?.seasonPass ?? null;
  const liveEvents = eventsQuery.data?.events ?? [];
  const storeOffers = storeCatalogQuery.data?.catalog.offers ?? [];
  const activeUpgrade = state.city.activeUpgrade;
  const activeTraining = state.city.activeTraining;
  const activeResearch = state.city.activeResearch;
  const totalStores = Object.values(state.city.resources).reduce((sum, value) => sum + value, 0);
  const primaryCommander = state.city.commanders.find((commander) => commander.isPrimary) ?? state.city.commanders[0];
  const selectedTroop = state.city.troops.find((troop) => troop.type === selectedTroopType) ?? state.city.troops[0];
  const townHall = state.city.buildings.find((building) => building.type === "TOWN_HALL");
  const activeTrainingLabel =
    state.city.troops.find((troop) => troop.type === activeTraining?.troopType)?.label ?? "Open";
  const activeResearchLabel =
    state.city.research.find((entry) => entry.type === activeResearch?.researchType)?.label ?? "Ready";
  const suggestedResearch = useMemo(
    () => state.city.research.find((entry) => entry.level < entry.maxLevel) ?? null,
    [state.city.research],
  );

  useEffect(() => {
    trackAnalyticsOnce(`tutorial_started:${state.player.id}`, "tutorial_started", { cityId: state.city.cityId });
    if (tutorialTasks[0]) {
      trackAnalyticsOnce(`tutorial_step_seen:${tutorialTasks[0].id}`, "tutorial_step_seen", {
        taskId: tutorialTasks[0].id,
      });
    }
  }, [state.city.cityId, state.player.id, tutorialTasks]);

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.statLabel}>{copy.dashboard.title}</p>
            <h2 className={styles.heroTitle}>{state.city.cityName}</h2>
            <p className={styles.heroLead}>
              Coordinates {state.city.coordinates.x}, {state.city.coordinates.y}. City growth, queues, research,
              commanders, and social pressure now sit in one premium operations deck.
            </p>
          </div>
          {activeUpgrade ? <TimerChip endsAt={activeUpgrade.completesAt} now={now} /> : <Badge tone="info">Queue idle</Badge>}
        </div>
        <div className={styles.heroSignals}>
          <article className={styles.signalCard}>
            <span className={styles.statLabel}>Town Hall</span>
            <strong className={styles.signalValue}>L{townHall?.level ?? 0}</strong>
            <span className={styles.stackHint}>Empire tier and district cap.</span>
          </article>
          <article className={styles.signalCard}>
            <span className={styles.statLabel}>Primary Commander</span>
            <strong className={styles.signalValue}>{primaryCommander?.name ?? "Unassigned"}</strong>
            <span className={styles.stackHint}>Lead frame for field control.</span>
          </article>
          <article className={styles.signalCard}>
            <span className={styles.statLabel}>Training Queue</span>
            <strong className={styles.signalValue}>{activeTraining ? activeTrainingLabel : "Open"}</strong>
            <span className={styles.stackHint}>{activeTraining ? `${activeTraining.quantity} units in progress.` : "Barracks ready for a fresh batch."}</span>
          </article>
          <article className={styles.signalCard}>
            <span className={styles.statLabel}>Research</span>
            <strong className={styles.signalValue}>{activeResearch ? activeResearchLabel : "Ready"}</strong>
            <span className={styles.stackHint}>{activeResearch ? "Academy queue is active." : "Open a doctrine lane for the next boost."}</span>
          </article>
        </div>
        <div className={styles.resourceStrip}>
          <ResourcePill label="Wood" value={state.city.resources.wood} />
          <ResourcePill label="Stone" value={state.city.resources.stone} />
          <ResourcePill label="Food" value={state.city.resources.food} />
          <ResourcePill label="Gold" value={state.city.resources.gold} />
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statCard}><span className={styles.statLabel}>Attack</span><strong className={styles.statValue}>{formatNumber(state.city.attackPower)}</strong></div>
          <div className={styles.statCard}><span className={styles.statLabel}>Defense</span><strong className={styles.statValue}>{formatNumber(state.city.defensePower)}</strong></div>
          <div className={styles.statCard}><span className={styles.statLabel}>Open marches</span><strong className={styles.statValue}>{formatNumber(state.city.openMarchCount)}</strong></div>
          <div className={styles.statCard}><span className={styles.statLabel}>Total stock</span><strong className={styles.statValue}>{formatNumber(totalStores)}</strong></div>
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <SectionCard kicker={copy.dashboard.tasks} title="First 5-minute flow" aside={<Badge tone={tasksQuery.data?.tutorialCompleted ? "success" : "warning"}>{tasksQuery.data?.tutorialCompleted ? "Complete" : "Open"}</Badge>}>
            <div className={styles.taskList}>
              {[...tutorialTasks.slice(0, 4), ...dailyTasks.slice(0, 2)].map((task) => (
                <article key={task.id} className={styles.taskCard}>
                  <div className={styles.taskMeta}>
                    <strong>{task.title}</strong>
                    <Badge tone={task.isClaimed ? "info" : task.isCompleted ? "success" : "warning"}>{task.progress}/{task.target}</Badge>
                  </div>
                  <p className={styles.stackHint}>{task.description}</p>
                  <div className={styles.taskActions}>
                    <Button type="button" size="small" disabled={task.isClaimed || !task.isCompleted || claimTaskMutation.isPending} onClick={() => claimTaskMutation.mutate(task.id)}>
                      {task.isClaimed ? "Claimed" : task.isCompleted ? "Claim Reward" : "Pending"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <div className={styles.grid}>
            <SectionCard kicker="Barracks" title="Troop training" aside={<Badge tone="info">{selectedTroop?.label ?? "Troops"}</Badge>}>
              <div className={styles.inlineForm}>
                <select value={selectedTroopType} onChange={(event) => setSelectedTroopType(event.target.value as TroopType)}>
                  {state.city.troops.map((troop) => <option key={troop.type} value={troop.type}>{troop.label}</option>)}
                </select>
                <input type="number" min={1} max={120} value={trainingQuantity} onChange={(event) => setTrainingQuantity(Number(event.target.value))} />
              </div>
              <p className={styles.stackHint}>Current stock {formatNumber(selectedTroop?.quantity ?? 0)} | Carry {formatNumber(selectedTroop?.carry ?? 0)} | Speed {selectedTroop?.speed.toFixed(2) ?? "0.00"}</p>
              <div className={styles.actionRow}>
                <Button type="button" disabled={isTraining || Boolean(state.city.activeTraining) || trainingQuantity < 1} onClick={() => train(selectedTroopType, trainingQuantity)}>
                  {state.city.activeTraining ? "Barracks busy" : isTraining ? "Submitting" : "Start Training"}
                </Button>
              </div>
            </SectionCard>

            <SectionCard kicker="Academy" title="Doctrine board" aside={<Badge tone="info">{suggestedResearch?.label ?? "All lanes capped"}</Badge>}>
              <div className={styles.compactList}>
                {state.city.research.map((entry) => (
                  <div key={entry.type} className={styles.taskMeta}>
                    <strong>{entry.label}</strong>
                    <Button type="button" variant="secondary" size="small" disabled={isResearching || entry.isActive || entry.level >= entry.maxLevel || Boolean(state.city.activeResearch)} onClick={() => research(entry.type as ResearchType)}>
                      L{entry.level}/{entry.maxLevel}
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard kicker={copy.dashboard.inventory} title="Speedups and chests" aside={<Badge tone="warning">{inventoryItems.length} lots</Badge>}>
              <div className={styles.compactList}>
                {inventoryItems.slice(0, 5).map((item) => (
                  <div key={item.itemKey} className={styles.taskMeta}>
                    <div><strong>{item.label}</strong><p className={styles.stackHint}>x{item.quantity}</p></div>
                    <Button type="button" variant="secondary" size="small" disabled={useItemMutation.isPending} onClick={() => useItemMutation.mutate({ itemKey: item.itemKey })}>
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard kicker="Live board" title="Events and season" aside={<Badge tone="success">{formatNumber(seasonPass?.xp ?? 0)} xp</Badge>}>
              <div className={styles.compactList}>
                {liveEvents.slice(0, 3).map((event) => (
                  <div key={event.eventKey} className={styles.taskMeta}>
                    <strong>{event.label}</strong>
                    <span className={styles.stackHint}>{event.score}/{event.target}</span>
                  </div>
                ))}
                <p className={styles.stackHint}>{seasonPass ? `${seasonPass.tiers.filter((tier) => tier.claimedFree).length} free tiers unlocked.` : "Season data is loading."}</p>
              </div>
            </SectionCard>
          </div>

          <SectionCard kicker="City districts" title="Upgrade lane">
            <div className={styles.buildingGrid}>
              {state.city.buildings.map((building) => (
                <article key={building.type} className={styles.buildingCard}>
                  <div className={styles.buildingHeader}>
                    <div><p className={styles.buildingMeta}>{building.label}</p><h3 className={styles.buildingTitle}>Level {building.level}</h3></div>
                    <Badge tone="info">Next {building.nextLevel}</Badge>
                  </div>
                  <p className={styles.buildingBody}>{building.description}</p>
                  <div className={styles.resourceList}>{Object.entries(building.upgradeCost).map(([resource, amount]) => <span key={resource}>{resource}: {formatNumber(amount)}</span>)}</div>
                  <div className={styles.actionRow}>
                    <Button type="button" disabled={isUpgrading || (Boolean(activeUpgrade) && !building.isUpgradeActive) || building.isUpgradeActive} onClick={() => upgrade(building.type as BuildingType)}>
                      {building.isUpgradeActive ? "In Progress" : "Upgrade"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>

        <aside className={styles.sideColumn}>
          <SectionCard kicker={copy.dashboard.commanders} title={primaryCommander?.name ?? "No commander"} aside={<Badge tone="info">L{primaryCommander?.level ?? 0}</Badge>}>
            <p className={styles.stackHint}>XP {formatNumber(primaryCommander?.xp ?? 0)}/{formatNumber(primaryCommander?.xpToNextLevel ?? 0)} | Stars {formatNumber(primaryCommander?.starLevel ?? 0)}</p>
            <div className={styles.actionRow}><Button type="button" onClick={() => openCommanderPanel(primaryCommander?.id)}>Open Commander Panel</Button></div>
          </SectionCard>

          <SectionCard kicker={copy.dashboard.mailbox} title="Latest dispatches" aside={<Badge tone="warning">{mailboxQuery.data?.unreadCount ?? 0} new</Badge>}>
            <div className={styles.compactList}>
              {mailboxEntries.slice(0, 4).map((entry) => <div key={entry.id} className={styles.taskMeta}><strong>{entry.title}</strong><span className={styles.stackHint}>{entry.canClaim ? "Reward waiting" : "Report archived"}</span></div>)}
            </div>
            <div className={styles.actionRow}><Button type="button" variant="secondary" onClick={openInbox}>Open Inbox</Button></div>
          </SectionCard>

          <SectionCard kicker={copy.dashboard.store} title="Store summary" aside={<Badge tone="success">{storeOffers.length} offers</Badge>}>
            <div className={styles.compactList}>
              {storeOffers.slice(0, 3).map((offer) => <div key={offer.offerId} className={styles.taskMeta}><strong>{offer.title}</strong><span className={styles.stackHint}>{offer.productIds.length} products</span></div>)}
            </div>
            <div className={styles.actionRow}><Button type="button" variant="secondary" onClick={openStorePreview}>Open Store</Button></div>
          </SectionCard>
        </aside>
      </div>
    </section>
  );
}
