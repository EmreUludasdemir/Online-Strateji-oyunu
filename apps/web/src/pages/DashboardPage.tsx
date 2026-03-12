import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type BuildingType, type ResearchType, type TroopType } from "@frontier/shared";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { trackAnalyticsOnce } from "../lib/analytics";
import styles from "../components/GameLayout.module.css";
import { formatNumber, formatRelativeTimer } from "../lib/formatters";
import { useNow } from "../lib/useNow";

const BUILDING_STAMPS: Record<BuildingType, string> = {
  TOWN_HALL: "TH",
  FARM: "FM",
  LUMBER_MILL: "LM",
  QUARRY: "QR",
  GOLD_MINE: "GM",
  BARRACKS: "BR",
  ACADEMY: "AC",
  WATCHTOWER: "WT",
};

export function DashboardPage() {
  const now = useNow();
  const { state, upgrade, train, research, isUpgrading, isTraining, isResearching } = useGameLayoutContext();
  const queryClient = useQueryClient();
  const [selectedTroopType, setSelectedTroopType] = useState<TroopType>("INFANTRY");
  const [trainingQuantity, setTrainingQuantity] = useState(12);

  const activeUpgrade = state.city.activeUpgrade;
  const totalStores = Object.values(state.city.resources).reduce((sum, value) => sum + value, 0);
  const lowestResource = Object.entries(state.city.resources).sort(([, left], [, right]) => left - right)[0];
  const recommendedUpgrade = [...state.city.buildings].sort((left, right) => {
    const leftTotal = Object.values(left.upgradeCost).reduce((sum, value) => sum + value, 0);
    const rightTotal = Object.values(right.upgradeCost).reduce((sum, value) => sum + value, 0);
    return leftTotal - rightTotal;
  })[0];
  const primaryCommander = state.city.commanders.find((commander) => commander.isPrimary) ?? state.city.commanders[0];
  const selectedTroop = state.city.troops.find((troop) => troop.type === selectedTroopType) ?? state.city.troops[0];
  const suggestedResearch = useMemo(
    () =>
      [...state.city.research]
        .filter((entry) => entry.level < entry.maxLevel)
        .sort((left, right) => left.level - right.level)[0] ?? null,
    [state.city.research],
  );
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: api.tasks,
  });
  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: api.inventory,
  });
  const mailboxQuery = useQuery({
    queryKey: ["mailbox"],
    queryFn: api.mailbox,
  });
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: api.events,
  });
  const storeCatalogQuery = useQuery({
    queryKey: ["store-catalog"],
    queryFn: api.storeCatalog,
  });
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
  const upgradeCommanderMutation = useMutation({
    mutationFn: (commanderId: string) => api.upgradeCommander(commanderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["game-state"] }),
        queryClient.invalidateQueries({ queryKey: ["commanders"] }),
      ]);
    },
  });
  const claimMailboxMutation = useMutation({
    mutationFn: (mailboxId: string) => api.claimMailbox(mailboxId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
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

  useEffect(() => {
    trackAnalyticsOnce(`tutorial_started:${state.player.id}`, "tutorial_started", {
      cityId: state.city.cityId,
    });
  }, [state.city.cityId, state.player.id]);

  return (
    <section className={styles.pageGrid}>
      <article className={styles.heroCard}>
        <div className={styles.heroTopline}>
          <div>
            <p className={styles.sectionKicker}>Imperial estate</p>
            <h2>{state.city.cityName}</h2>
            <p className={styles.heroLead}>
              From coordinates {state.city.coordinates.x}, {state.city.coordinates.y}, this province directs roads,
              storehouses, academies, and banners like a living court rather than a static settlement.
            </p>
          </div>
          <span className={styles.levelBadge}>Imperial Core v2</span>
        </div>
        <div className={styles.heroStats}>
          <article className={styles.heroStat}>
            <span>Attack power</span>
            <strong>{formatNumber(state.city.attackPower)}</strong>
            <small>field pressure</small>
          </article>
          <article className={styles.heroStat}>
            <span>Defense power</span>
            <strong>{formatNumber(state.city.defensePower)}</strong>
            <small>garrison resilience</small>
          </article>
          <article className={styles.heroStat}>
            <span>Open marches</span>
            <strong>{formatNumber(state.city.openMarchCount)}</strong>
            <small>active field orders</small>
          </article>
          <article className={styles.heroStat}>
            <span>Total stores</span>
            <strong>{formatNumber(totalStores)}</strong>
            <small>all resources combined</small>
          </article>
        </div>
        {activeUpgrade ? (
          <div className={styles.statusStrip}>
            Active building order: {activeUpgrade.buildingType.replaceAll("_", " ")} to level {activeUpgrade.toLevel}.{" "}
            Completes in {formatRelativeTimer(activeUpgrade.completesAt, now)}.
          </div>
        ) : (
          <div className={styles.statusStrip}>No construction is active. Queue a new district upgrade below.</div>
        )}
      </article>

      <section className={styles.commandDeck}>
          <article className={styles.commandCard}>
          <p className={styles.sectionKicker}>Divan focus</p>
          <strong className={styles.commandValue}>{lowestResource?.[0] ?? "wood"}</strong>
          <p className={styles.commandHint}>Lowest stockpile should be stabilized before extended marches.</p>
        </article>
        <article className={styles.commandCard}>
          <p className={styles.sectionKicker}>Primary commander</p>
          <strong className={styles.commandValue}>{primaryCommander?.name ?? "No commander"}</strong>
          <p className={styles.commandHint}>
            {primaryCommander
              ? `+${primaryCommander.attackBonusPct}% atk, +${primaryCommander.defenseBonusPct}% def, +${primaryCommander.marchSpeedBonusPct}% speed`
              : "No field commander is currently assigned."}
          </p>
        </article>
        <article className={styles.commandCard}>
          <p className={styles.sectionKicker}>Recommended doctrine</p>
          <strong className={styles.commandValue}>{suggestedResearch?.label ?? "Doctrine capped"}</strong>
          <p className={styles.commandHint}>
            {suggestedResearch
              ? `${suggestedResearch.label} is the next underdeveloped research lane.`
              : "All current research tracks are at their cap."}
          </p>
        </article>
        <article className={styles.commandCard}>
          <p className={styles.sectionKicker}>Alliance status</p>
          <strong className={styles.commandValue}>
            {state.alliance ? `[${state.alliance.tag}] ${state.alliance.name}` : "Independent"}
          </strong>
          <p className={styles.commandHint}>
            {state.alliance
              ? `${state.alliance.memberCount} members under your current banner.`
              : "Join or create an alliance to unlock help requests and field chat."}
          </p>
        </article>
      </section>

      <section className={styles.cardGrid}>
        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Army panel</p>
              <h3>Troop drill command</h3>
            </div>
            <span className={styles.levelBadge}>Barracks</span>
          </div>
          <div className={styles.costGrid}>
            {state.city.troops.map((troop) => (
              <div key={troop.type}>
                <dt>{troop.label}</dt>
                <dd>{formatNumber(troop.quantity)}</dd>
              </div>
            ))}
          </div>
          <div className={styles.inlineForm}>
            <select value={selectedTroopType} onChange={(event) => setSelectedTroopType(event.target.value as TroopType)}>
              {state.city.troops.map((troop) => (
                <option key={troop.type} value={troop.type}>
                  {troop.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={120}
              value={trainingQuantity}
              onChange={(event) => setTrainingQuantity(Number(event.target.value))}
            />
          </div>
          <p className={styles.buildingText}>
            {selectedTroop?.label}: atk {selectedTroop ? formatNumber(selectedTroop.attack) : "-"}, def{" "}
            {selectedTroop ? formatNumber(selectedTroop.defense) : "-"}, carry{" "}
            {selectedTroop ? formatNumber(selectedTroop.carry) : "-"}.
          </p>
          {state.city.activeTraining ? (
            <div className={styles.statusStrip}>
              Training {state.city.activeTraining.quantity} {state.city.activeTraining.troopType.toLowerCase()} and
              finishing in {formatRelativeTimer(state.city.activeTraining.completesAt, now)}.
            </div>
          ) : null}
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isTraining || Boolean(state.city.activeTraining) || trainingQuantity < 1}
            onClick={() => train(selectedTroopType, trainingQuantity)}
          >
            {isTraining ? "Posting drill order..." : state.city.activeTraining ? "Training queue occupied" : "Train troops"}
          </button>
        </article>

        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Research panel</p>
              <h3>Academy doctrine board</h3>
            </div>
            <span className={styles.levelBadge}>Academy</span>
          </div>
          <div className={styles.cardStack}>
            {state.city.research.map((entry) => (
              <button
                key={entry.type}
                className={styles.subtleButton}
                type="button"
                disabled={isResearching || entry.isActive || entry.level >= entry.maxLevel || Boolean(state.city.activeResearch)}
                onClick={() => research(entry.type as ResearchType)}
              >
                <span>{entry.label}</span>
                <small>
                  L{entry.level}/{entry.maxLevel}
                </small>
              </button>
            ))}
          </div>
          {state.city.activeResearch ? (
            <div className={styles.statusStrip}>
              Researching {state.city.activeResearch.researchType.replaceAll("_", " ").toLowerCase()} to level{" "}
              {state.city.activeResearch.toLevel}. Finishes in {formatRelativeTimer(state.city.activeResearch.completesAt, now)}.
            </div>
          ) : (
            <p className={styles.buildingText}>Research queue is idle. Pick a doctrine lane to keep momentum.</p>
          )}
        </article>
      </section>

      <section className={styles.cardGrid}>
        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Quests</p>
              <h3>Tutorial and daily orders</h3>
            </div>
            <span className={styles.levelBadge}>{tasksQuery.data?.tutorialCompleted ? "sealed" : "active"}</span>
          </div>
          <div className={styles.cardStack}>
            {[...tutorialTasks.slice(0, 3), ...dailyTasks.slice(0, 2)].map((task) => (
              <button
                key={task.id}
                className={styles.subtleButton}
                type="button"
                disabled={task.isClaimed || !task.isCompleted || claimTaskMutation.isPending}
                onClick={() => claimTaskMutation.mutate(task.id)}
              >
                <span>{task.title}</span>
                <small>
                  {task.progress}/{task.target}
                  {task.isClaimed ? " claimed" : task.isCompleted ? " ready" : ""}
                </small>
              </button>
            ))}
          </div>
          <p className={styles.buildingText}>
            {tasksQuery.data
              ? `${tutorialTasks.filter((task) => task.isClaimed).length}/${tutorialTasks.length || 1} tutorial objectives sealed.`
              : "Task board is loading."}
          </p>
        </article>

        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Inventory</p>
              <h3>Field items and accelerants</h3>
            </div>
            <span className={styles.levelBadge}>{inventoryItems.length} lots</span>
          </div>
          <div className={styles.cardStack}>
            {inventoryItems.slice(0, 5).map((item) => (
              <button
                key={item.itemKey}
                className={styles.subtleButton}
                type="button"
                disabled={useItemMutation.isPending}
                onClick={() => useItemMutation.mutate({ itemKey: item.itemKey })}
              >
                <span>{item.label}</span>
                <small>x{item.quantity}</small>
              </button>
            ))}
          </div>
          <p className={styles.buildingText}>
            Resource chests, speedups and tomes can be used directly from the estate ledger.
          </p>
        </article>

        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Commander progression</p>
              <h3>War council roster</h3>
            </div>
            <span className={styles.levelBadge}>{state.city.commanders.length} officers</span>
          </div>
          <div className={styles.cardStack}>
            {state.city.commanders.slice(0, 4).map((commander) => (
              <button
                key={commander.id}
                className={styles.subtleButton}
                type="button"
                disabled={upgradeCommanderMutation.isPending || commander.xp < commander.xpToNextLevel}
                onClick={() => upgradeCommanderMutation.mutate(commander.id)}
              >
                <span>
                  {commander.name} L{commander.level}
                </span>
                <small>
                  XP {commander.xp}/{commander.xpToNextLevel} · stars {commander.starLevel}
                </small>
              </button>
            ))}
          </div>
          <p className={styles.buildingText}>
            Promotion costs gold but raises stars, talent depth and front-line pressure.
          </p>
        </article>
      </section>

      <section className={styles.cardGrid}>
        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Mailbox</p>
              <h3>Imperial dispatches</h3>
            </div>
            <span className={styles.levelBadge}>{mailboxQuery.data?.unreadCount ?? 0} unread</span>
          </div>
          <div className={styles.cardStack}>
            {mailboxEntries.slice(0, 4).map((entry) => (
              <button
                key={entry.id}
                className={styles.subtleButton}
                type="button"
                disabled={!entry.canClaim || claimMailboxMutation.isPending}
                onClick={() => entry.canClaim && claimMailboxMutation.mutate(entry.id)}
              >
                <span>{entry.title}</span>
                <small>{entry.canClaim ? "claim reward" : entry.scoutReport ? "read report" : "archived"}</small>
              </button>
            ))}
          </div>
          <p className={styles.buildingText}>
            Scout reports, season rewards and purchase grants now arrive through a single inbox.
          </p>
        </article>

        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Season table</p>
              <h3>Live events and pass</h3>
            </div>
            <span className={styles.levelBadge}>{seasonPass?.xp ?? 0} xp</span>
          </div>
          <div className={styles.cardStack}>
            {liveEvents.slice(0, 3).map((event) => (
              <div key={event.eventKey} className={styles.subtleButton}>
                <span>{event.label}</span>
                <small>
                  {event.score}/{event.target}
                </small>
              </div>
            ))}
          </div>
          <p className={styles.buildingText}>
            {seasonPass
              ? `${seasonPass.tiers.filter((tier) => tier.claimedFree).length} free pass tiers are already unlocked.`
              : "Season board is loading."}
          </p>
        </article>

        <article className={styles.buildingCard}>
          <div className={styles.buildingHeader}>
            <div>
              <p className={styles.sectionKicker}>Store caravan</p>
              <h3>Rotating offers</h3>
            </div>
            <span className={styles.levelBadge}>{storeOffers.length} offers</span>
          </div>
          <div className={styles.cardStack}>
            {storeOffers.slice(0, 3).map((offer) => (
              <div key={offer.offerId} className={styles.subtleButton}>
                <span>{offer.title}</span>
                <small>{offer.productIds.length} products</small>
              </div>
            ))}
          </div>
          <p className={styles.buildingText}>
            Offer rotation now reacts to player segments and exposed catalog state.
          </p>
        </article>
      </section>

      <div className={styles.cardGrid}>
        {state.city.buildings.map((building) => {
          const blockedByQueue = Boolean(activeUpgrade) && !building.isUpgradeActive;

          return (
            <article key={building.type} className={styles.buildingCard}>
              <div className={styles.buildingHeader}>
                <div className={styles.buildingHeading}>
                  <div className={styles.districtStamp}>{BUILDING_STAMPS[building.type as BuildingType]}</div>
                  <div>
                    <p className={styles.sectionKicker}>{building.label}</p>
                    <h3>Level {building.level}</h3>
                  </div>
                </div>
                <span className={styles.levelBadge}>Next {building.nextLevel}</span>
              </div>
              <p className={styles.buildingTag}>{building.description}</p>
              <dl className={styles.costGrid}>
                {Object.entries(building.upgradeCost).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt>{resource}</dt>
                    <dd>{formatNumber(amount)}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.timerText}>
                Upgrade time: {Math.floor(building.upgradeDurationSeconds / 60)}m {building.upgradeDurationSeconds % 60}s
              </p>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isUpgrading || blockedByQueue || building.isUpgradeActive}
                onClick={() => upgrade(building.type as BuildingType)}
              >
                {building.isUpgradeActive
                  ? "Currently upgrading"
                  : blockedByQueue
                    ? "Queue is occupied"
                    : recommendedUpgrade?.type === building.type
                      ? "Recommended upgrade"
                      : "Upgrade building"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
