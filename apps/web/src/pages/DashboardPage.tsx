import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type BuildingType, type ResearchType, type TroopType } from "@frontier/shared";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { useGameLayoutContext } from "../components/GameLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FeedCardShell, PanelStatGrid, SectionHeaderBlock, type PanelStatItem } from "../components/ui/CommandSurface";
import { buildingIcon } from "../components/ui/buildingIcons";
import { SectionCard } from "../components/ui/SectionCard";
import { TimerChip } from "../components/ui/TimerChip";
import { trackAnalyticsOnce } from "../lib/analytics";
import { copy } from "../lib/i18n";
import { formatNumber } from "../lib/formatters";
import { useNow } from "../lib/useNow";
import type { DashboardBriefingAction } from "./dashboardBriefing";
import { buildDashboardBriefing } from "./dashboardBriefing";
import styles from "./DashboardPage.module.css";

type DistrictStageTone = "core" | "war" | "economy" | "support";
type DashboardInfoPanelId = "overview" | "queues" | "briefing" | "district";
type DashboardPanelButtonVariant = "primary" | "secondary" | "ghost";
type DashboardTone = "info" | "success" | "warning" | "danger";

interface DashboardPanelAction {
  label: string;
  onClick: () => void;
  variant?: DashboardPanelButtonVariant;
  disabled?: boolean;
}

interface DashboardInfoPanel {
  id: DashboardInfoPanelId;
  label: string;
  value: string;
  kicker: string;
  title: string;
  badgeTone: DashboardTone;
  badgeLabel: string;
  stats: PanelStatItem[];
  actions: DashboardPanelAction[];
}

interface DistrictStageLayoutEntry {
  x: number;
  y: number;
  tone: DistrictStageTone;
}

const districtStageLayout: Record<BuildingType, DistrictStageLayoutEntry> = {
  TOWN_HALL: { x: 50, y: 40, tone: "core" },
  BARRACKS: { x: 69, y: 32, tone: "war" },
  ACADEMY: { x: 31, y: 30, tone: "support" },
  WATCHTOWER: { x: 77, y: 16, tone: "war" },
  FARM: { x: 26, y: 67, tone: "economy" },
  LUMBER_MILL: { x: 59, y: 68, tone: "economy" },
  QUARRY: { x: 73, y: 56, tone: "economy" },
  GOLD_MINE: { x: 44, y: 72, tone: "economy" },
  HOSPITAL: { x: 20, y: 48, tone: "support" },
  WALL: { x: 50, y: 82, tone: "war" },
  EMBASSY: { x: 22, y: 22, tone: "support" },
  FORGE: { x: 78, y: 46, tone: "war" },
};

function formatCompactMetric(value: number) {
  if (value >= 1_000_000) {
    const compact = value / 1_000_000;
    return `${compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)}M`;
  }

  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return formatNumber(value);
}

export function DashboardPage() {
  const now = useNow();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    state,
    bootstrap,
    upgrade,
    train,
    research,
    openCommanderPanel,
    isUpgrading,
    isTraining,
    isResearching,
  } = useGameLayoutContext();
  const [selectedTroopType, setSelectedTroopType] = useState<TroopType>("INFANTRY");
  const [trainingQuantity, setTrainingQuantity] = useState(12);
  const [activeDashboardPanel, setActiveDashboardPanel] = useState<DashboardInfoPanelId>("overview");

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const inventoryQuery = useQuery({ queryKey: ["inventory"], queryFn: api.inventory });
  const mailboxQuery = useQuery({ queryKey: ["mailbox"], queryFn: api.mailbox });
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: api.events });
  const storeCatalogQuery = useQuery({
    queryKey: ["store-catalog"],
    queryFn: api.storeCatalog,
    enabled: bootstrap.storeEnabled,
  });

  const invalidateProgressQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
      queryClient.invalidateQueries({ queryKey: ["events"] }),
      queryClient.invalidateQueries({ queryKey: ["game-state"] }),
    ]);
  };

  const claimTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.claimTask(taskId),
    onSuccess: invalidateProgressQueries,
  });

  const claimMailboxMutation = useMutation({
    mutationFn: (mailboxId: string) => api.claimMailbox(mailboxId),
    onSuccess: invalidateProgressQueries,
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
  const unreadMailboxCount = mailboxQuery.data?.unreadCount ?? 0;
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
  const [selectedDistrictType, setSelectedDistrictType] = useState<BuildingType>(
    state.city.activeUpgrade?.buildingType ?? townHall?.type ?? state.city.buildings[0]?.type ?? "TOWN_HALL",
  );
  const suggestedResearch = useMemo(
    () => state.city.research.find((entry) => entry.level < entry.maxLevel) ?? null,
    [state.city.research],
  );
  const allianceLabel = state.alliance ? `[${state.alliance.tag}] ${state.alliance.name}` : "Independent province";
  const provinceStatus = state.city.peaceShieldUntil ? "Peace shield active" : "Battle ready";
  const allTasks = [...tutorialTasks, ...dailyTasks];
  const claimableCount =
    allTasks.filter((task) => task.isCompleted && !task.isClaimed).length +
    mailboxEntries.filter((entry) => entry.canClaim).length;
  const idleQueueCount = Number(!activeUpgrade) + Number(!activeTraining) + Number(!activeResearch);
  const woundedTotal =
    state.city.woundedTroops.INFANTRY +
    state.city.woundedTroops.ARCHER +
    state.city.woundedTroops.CAVALRY;
  const queueLedger = [
    {
      id: "build",
      label: "Build queue",
      value: activeUpgrade ? `L${activeUpgrade.toLevel}` : "Idle",
      detail: activeUpgrade
        ? `${activeUpgrade.buildingType.replaceAll("_", " ").toLowerCase()} upgrade is underway.`
        : "Town planners are waiting for a fresh order.",
    },
    {
      id: "training",
      label: "Barracks",
      value: activeTraining ? `${activeTrainingLabel} x${formatNumber(activeTraining.quantity)}` : "Ready",
      detail: activeTraining ? "Fresh troops are staging inside the drill yard." : "A new unit batch can start immediately.",
    },
    {
      id: "research",
      label: "Academy",
      value: activeResearch ? activeResearchLabel : "Open",
      detail: activeResearch ? "Doctrine scribes are processing the active study." : "No doctrine is currently consuming the queue.",
    },
  ];
  const selectedDistrict =
    state.city.buildings.find((building) => building.type === selectedDistrictType) ?? state.city.buildings[0] ?? null;
  const cityStageNodes = useMemo(
    () =>
      state.city.buildings
        .map((building) => {
          const layout = districtStageLayout[building.type] ?? districtStageLayout.TOWN_HALL;
          const status = building.isUpgradeActive
            ? "active"
            : selectedDistrictType === building.type
              ? "selected"
              : "ready";
          const BUILDING_HINTS: Partial<Record<BuildingType, string>> = {
            TOWN_HALL: "City cap, district ceiling, and command level.",
            BARRACKS: "Troop throughput and drill cadence.",
            ACADEMY: "Doctrine depth and logistics research.",
            WATCHTOWER: "Threat readout and frontier awareness.",
            FARM: "Food output sustains troop upkeep and training.",
            LUMBER_MILL: "Timber flow powers district construction.",
            QUARRY: "Stone pressure feeds defensive upgrades.",
            GOLD_MINE: "Treasury income funds research and elite actions.",
            HOSPITAL: "Wounded troop recovery — heals garrison losses over time.",
            WALL: "Fortification layer — adds heavy structural defense to the city.",
            EMBASSY: "Diplomatic hub — enables alliance coordination and aid requests.",
            FORGE: "Weapon craft — sharpens attack power across all garrison troops.",
          };
          const hint = building.isUpgradeActive
            ? `Upgrade lane to L${building.nextLevel} is active.`
            : BUILDING_HINTS[building.type] ?? "Resource flow and empire upkeep.";

          return {
            ...layout,
            type: building.type,
            label: building.label,
            level: building.level,
            nextLevel: building.nextLevel,
            status,
            hint,
            iconSrc: buildingIcon(building.type),
          };
        })
        .sort((left, right) => (left.type === selectedDistrictType ? -1 : right.type === selectedDistrictType ? 1 : left.y - right.y)),
    [selectedDistrictType, state.city.buildings],
  );
  const stageQueueCards = [
    {
      id: "construction",
      label: "Construction",
      value: activeUpgrade ? activeUpgrade.buildingType.replaceAll("_", " ") : "Idle",
      detail: activeUpgrade ? `L${activeUpgrade.toLevel} in progress` : "District crews are standing by",
      tone: activeUpgrade ? "warning" : "success",
    },
    {
      id: "dispatch",
      label: "Dispatch",
      value: mailboxEntries[0]?.title ?? "Archive quiet",
      detail:
        mailboxEntries[0]?.canClaim ?? false
          ? "Claimable warrant waiting in the archive"
          : `${unreadMailboxCount} unread messages on the rail`,
      tone: unreadMailboxCount ? "info" : "success",
    },
    {
      id: "doctrine",
      label: "Doctrine",
      value: activeResearchLabel,
      detail: activeResearch ? "Academy lane is consuming the queue" : "Open a lane to accelerate the city curve",
      tone: activeResearch ? "info" : "warning",
    },
  ] as const;
  const cityAdvisorBrief = activeUpgrade
    ? `${activeUpgrade.buildingType.replaceAll("_", " ")} -> L${activeUpgrade.toLevel}`
    : activeResearch
      ? `${activeResearchLabel} active`
      : `${state.city.cityName}: stable`;
  const getBuildingBonusStat = (type: BuildingType, level: number) => {
    if (type === "HOSPITAL")
      return { id: "bonus", label: "Heal capacity", value: `${state.city.hospitalHealingCapacity}/tick`, note: "Wounded troops recovered per reconcile" };
    if (type === "WALL")
      return { id: "bonus", label: "Wall defense", value: `+${level * 40}`, note: "Structural defense added to city shield" };
    if (type === "FORGE")
      return { id: "bonus", label: "Attack boost", value: `+${level * 4}%`, note: "Forge multiplier on all troop attack" };
    if (type === "WATCHTOWER")
      return { id: "bonus", label: "Vision radius", value: `${state.city.visionRadius}`, note: "Current scouting coverage in tiles" };
    if (type === "BARRACKS")
      return { id: "bonus", label: "Train speed", value: `+${Math.max(0, level - 1) * 12}%`, note: "Training queue acceleration" };
    return null;
  };
  const selectedDistrictStats = selectedDistrict
    ? [
        {
          id: "level",
          label: "Current level",
          value: `L${selectedDistrict.level}`,
          note: "Current district rank",
        },
        {
          id: "next",
          label: "Next level",
          value: `L${selectedDistrict.nextLevel}`,
          note: "Queued target tier",
        },
        {
          id: "queue",
          label: "Queue state",
          value: selectedDistrict.isUpgradeActive ? "Running" : activeUpgrade ? "Queued elsewhere" : "Ready",
          note: selectedDistrict.isUpgradeActive ? "Master queue is live" : activeUpgrade ? "Another district holds the line" : "Open for a fresh order",
          tone: selectedDistrict.isUpgradeActive ? ("warning" as const) : activeUpgrade ? ("info" as const) : ("success" as const),
        },
        ...(getBuildingBonusStat(selectedDistrict.type as BuildingType, selectedDistrict.level)
          ? [getBuildingBonusStat(selectedDistrict.type as BuildingType, selectedDistrict.level)!]
          : []),
      ]
    : [];
  const dashboardBriefing = useMemo(
    () =>
      buildDashboardBriefing({
        state,
        tutorialTasks,
        dailyTasks,
        mailboxEntries,
        unreadMailboxCount,
        liveEvents,
      }),
    [dailyTasks, liveEvents, mailboxEntries, state, tutorialTasks, unreadMailboxCount],
  );

  const isBriefingActionBusy = (action: DashboardBriefingAction) => {
    switch (action.command.type) {
      case "claim_task":
        return claimTaskMutation.isPending;
      case "claim_mailbox":
        return claimMailboxMutation.isPending;
      case "upgrade":
        return isUpgrading || Boolean(state.city.activeUpgrade);
      case "train":
        return isTraining || Boolean(state.city.activeTraining);
      case "research":
        return isResearching || Boolean(state.city.activeResearch);
      case "open_route":
        return false;
    }
  };

  const runBriefingAction = async (action: DashboardBriefingAction) => {
    switch (action.command.type) {
      case "claim_task":
        claimTaskMutation.mutate(action.command.taskId);
        return;
      case "claim_mailbox":
        claimMailboxMutation.mutate(action.command.mailboxId);
        return;
      case "upgrade":
        await upgrade(action.command.buildingType);
        return;
      case "train":
        await train(action.command.troopType, action.command.quantity);
        return;
      case "research":
        await research(action.command.researchType);
        return;
      case "open_route":
        navigate(action.command.route);
        return;
    }
  };

  const firstBriefingAction = dashboardBriefing.actions[0] ?? null;
  const dashboardInfoPanels: Record<DashboardInfoPanelId, DashboardInfoPanel> = {
    overview: {
      id: "overview",
      label: "Overview",
      value: formatCompactMetric(totalStores),
      kicker: "Province",
      title: `${state.city.cityName} at ${state.city.coordinates.x}, ${state.city.coordinates.y}`,
      badgeTone: state.city.peaceShieldUntil ? "info" : "warning",
      badgeLabel: provinceStatus,
      stats: [
        { id: "attack", label: "Attack", value: formatNumber(state.city.attackPower), note: "Field strike power", tone: "warning" },
        { id: "defense", label: "Defense", value: formatNumber(state.city.defensePower), note: "City shield value", tone: "info" },
        { id: "stock", label: "Stock", value: formatNumber(totalStores), note: "All resources", tone: "success" },
      ],
      actions: [
        { label: "Map", onClick: () => navigate("/app/map"), variant: "primary" },
        { label: "Messages", onClick: () => navigate("/app/messages"), variant: "secondary" },
      ],
    },
    queues: {
      id: "queues",
      label: "Queues",
      value: `${idleQueueCount}/3`,
      kicker: "Build / Train / Research",
      title: idleQueueCount > 0 ? "Fill idle lanes" : "All lanes moving",
      badgeTone: idleQueueCount > 0 ? "warning" : "success",
      badgeLabel: idleQueueCount > 0 ? "Needs order" : "In motion",
      stats: queueLedger.map((entry) => ({
        id: entry.id,
        label: entry.label,
        value: entry.value,
        note: entry.detail,
        tone: entry.value === "Idle" || entry.value === "Ready" || entry.value === "Open" ? "warning" : "info",
      })),
      actions: [
        {
          label: selectedDistrict?.isUpgradeActive ? "Building" : activeUpgrade ? "Locked" : "Upgrade",
          onClick: () => selectedDistrict && void upgrade(selectedDistrict.type as BuildingType),
          variant: "primary",
          disabled: !selectedDistrict || isUpgrading || selectedDistrict.isUpgradeActive || Boolean(activeUpgrade),
        },
        {
          label: state.city.activeTraining ? "Training" : "Train",
          onClick: () => void train(selectedTroopType, trainingQuantity),
          variant: "secondary",
          disabled: isTraining || Boolean(state.city.activeTraining) || trainingQuantity < 1,
        },
      ],
    },
    briefing: {
      id: "briefing",
      label: "Briefing",
      value: formatNumber(dashboardBriefing.actions.length),
      kicker: "Next tap",
      title: dashboardBriefing.headline,
      badgeTone: dashboardBriefing.badgeTone,
      badgeLabel: dashboardBriefing.badgeLabel,
      stats: dashboardBriefing.stats,
      actions: [
        firstBriefingAction
          ? {
              label: firstBriefingAction.ctaLabel,
              onClick: () => void runBriefingAction(firstBriefingAction),
              variant: "primary",
              disabled: isBriefingActionBusy(firstBriefingAction),
            }
          : { label: "Open map", onClick: () => navigate("/app/map"), variant: "primary" },
      ],
    },
    district: {
      id: "district",
      label: "District",
      value: selectedDistrict ? `L${selectedDistrict.level}` : "0",
      kicker: "Selected node",
      title: selectedDistrict?.label ?? "Select a district",
      badgeTone: selectedDistrict?.isUpgradeActive ? "warning" : "info",
      badgeLabel: selectedDistrict ? `Next L${selectedDistrict.nextLevel}` : "No node",
      stats: selectedDistrictStats,
      actions: [
        {
          label: selectedDistrict?.isUpgradeActive ? "Building" : activeUpgrade ? "Queue locked" : "Upgrade",
          onClick: () => selectedDistrict && void upgrade(selectedDistrict.type as BuildingType),
          variant: "primary",
          disabled: !selectedDistrict || isUpgrading || selectedDistrict.isUpgradeActive || Boolean(activeUpgrade),
        },
        { label: "Map", onClick: () => navigate("/app/map"), variant: "secondary" },
      ],
    },
  };
  const dashboardPanelOrder: DashboardInfoPanelId[] = ["overview", "queues", "briefing", "district"];
  const activeCommandPanel = dashboardInfoPanels[activeDashboardPanel];
  const citySceneQuickRoutes = [
    { id: "map", label: "Map", glyph: "MAP", badge: formatNumber(state.city.openMarchCount), onClick: () => navigate("/app/map") },
    { id: "war", label: "War", glyph: "WAR", badge: formatNumber(state.city.attackPower), onClick: () => navigate("/app/reports") },
    { id: "mail", label: "Mail", glyph: "MSG", badge: formatNumber(unreadMailboxCount), onClick: () => navigate("/app/messages") },
    { id: "alliance", label: "Ally", glyph: "ALLY", badge: state.alliance?.tag ?? "--", onClick: () => navigate("/app/alliance") },
    { id: "research", label: "Arc", glyph: "ARC", badge: activeResearch ? "Live" : "Open", onClick: () => navigate("/app/research") },
    { id: "market", label: "Market", glyph: "MKT", badge: formatNumber(inventoryItems.length), onClick: () => navigate("/app/market") },
  ];
  const citySceneDockActions: DashboardPanelAction[] = [
    {
      label: selectedDistrict?.isUpgradeActive ? "Building" : activeUpgrade ? "Locked" : "Build",
      onClick: () => selectedDistrict && void upgrade(selectedDistrict.type as BuildingType),
      variant: "primary",
      disabled: !selectedDistrict || isUpgrading || selectedDistrict.isUpgradeActive || Boolean(activeUpgrade),
    },
    {
      label: state.city.activeTraining ? "Training" : "Train",
      onClick: () => void train(selectedTroopType, trainingQuantity),
      variant: "secondary",
      disabled: isTraining || Boolean(state.city.activeTraining) || trainingQuantity < 1,
    },
    {
      label: activeResearch ? "Researching" : "Research",
      onClick: () => (suggestedResearch ? void research(suggestedResearch.type as ResearchType) : navigate("/app/research")),
      variant: "secondary",
      disabled: isResearching || Boolean(activeResearch) || !suggestedResearch,
    },
    { label: "World", onClick: () => navigate("/app/map"), variant: "ghost" },
    { label: "Alliance", onClick: () => navigate("/app/alliance"), variant: "ghost" },
  ];

  useEffect(() => {
    if (!selectedDistrict && state.city.buildings[0]) {
      setSelectedDistrictType(state.city.buildings[0].type as BuildingType);
    }
  }, [selectedDistrict, state.city.buildings]);

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
      <header className={styles.cityHome} data-dashboard-city-home="true">
        <div className={styles.cityHomeScene}>
          <div className={styles.citySceneTopBar}>
            <div className={styles.citySceneTitleBlock}>
              <span className={styles.citySceneKicker}>City</span>
              <h2 className={styles.citySceneTitle}>{state.city.cityName}</h2>
              <span className={styles.citySceneCoords}>
                {state.city.coordinates.x}, {state.city.coordinates.y} | {state.alliance?.tag ?? "Solo"}
              </span>
            </div>
            <div className={styles.citySceneBadges}>
              {activeUpgrade ? <TimerChip endsAt={activeUpgrade.completesAt} now={now} /> : <Badge tone="info">Idle</Badge>}
              <Badge tone={idleQueueCount > 0 ? "warning" : "success"}>{idleQueueCount}/3 queues</Badge>
            </div>
          </div>

          <div className={[styles.citySceneShortcutRail, styles.citySceneShortcutRailLeft].join(" ")}>
            {citySceneQuickRoutes.slice(0, 3).map((action) => (
              <button key={action.id} type="button" className={styles.citySceneShortcut} onClick={action.onClick}>
                <strong>{action.glyph}</strong>
                <span>{action.badge}</span>
              </button>
            ))}
          </div>

          <div className={[styles.citySceneShortcutRail, styles.citySceneShortcutRailRight].join(" ")}>
            {citySceneQuickRoutes.slice(3).map((action) => (
              <button key={action.id} type="button" className={styles.citySceneShortcut} onClick={action.onClick}>
                <strong>{action.glyph}</strong>
                <span>{action.badge}</span>
              </button>
            ))}
          </div>

          <div className={styles.citySceneRoad} />
          {cityStageNodes.map((node) => (
            <button
              key={node.type}
              type="button"
              data-city-node={node.type}
              aria-label={`${node.label} level ${node.level}`}
              className={[
                styles.citySceneNode,
                node.status === "active" ? styles.citySceneNodeActive : "",
                node.status === "selected" ? styles.citySceneNodeSelected : "",
                styles[`citySceneNodeTone${node.tone[0].toUpperCase()}${node.tone.slice(1)}` as keyof typeof styles],
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  "--node-x": `${node.x}%`,
                  "--node-y": `${node.y}%`,
                } as CSSProperties
              }
              onClick={() => {
                setSelectedDistrictType(node.type);
                setActiveDashboardPanel("district");
              }}
            >
              <span className={styles.citySceneNodeShadow} />
              <span className={styles.citySceneNodeFrame}>
                <img src={node.iconSrc} alt="" aria-hidden="true" className={styles.citySceneNodeIcon} />
              </span>
              <span className={styles.citySceneNodeLevel}>L{node.level}</span>
              <strong className={styles.citySceneNodeName}>{node.label}</strong>
            </button>
          ))}

          <aside className={styles.cityScenePanel} aria-live="polite">
            <div>
              <span className={styles.citySceneKicker}>{activeCommandPanel.kicker}</span>
              <strong>{activeCommandPanel.title}</strong>
            </div>
            <div className={styles.cityScenePanelStats}>
              {activeCommandPanel.stats.slice(0, 3).map((metric) => (
                <span key={metric.id}>
                  {metric.label}: <strong>{metric.value}</strong>
                </span>
              ))}
            </div>
          </aside>

          <div className={styles.cityScenePanelSwitch} aria-label="City information panels">
            {dashboardPanelOrder.map((panelId) => {
              const panel = dashboardInfoPanels[panelId];
              return (
                <button
                  key={panel.id}
                  type="button"
                  data-dashboard-panel={panel.id}
                  className={[styles.cityScenePanelButton, activeDashboardPanel === panel.id ? styles.cityScenePanelButtonActive : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setActiveDashboardPanel(panel.id)}
                >
                  <span>{panel.label}</span>
                  <strong>{panel.value}</strong>
                </button>
              );
            })}
          </div>

          <nav className={styles.citySceneDock} aria-label="Primary city actions">
            {citySceneDockActions.map((action) => (
              <Button
                key={action.label}
                type="button"
                size="small"
                variant={action.variant ?? "secondary"}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <SectionCard
        kicker="Command Briefing"
        title={dashboardBriefing.headline}
        aside={<Badge tone={dashboardBriefing.badgeTone}>{dashboardBriefing.badgeLabel}</Badge>}
      >
        <div className={styles.briefingLayout}>
          <SectionHeaderBlock
            kicker="Short-session loop"
            title="Action queue"
            lead={`${formatNumber(dashboardBriefing.actions.length)} actions | ${idleQueueCount}/3 idle queues | ${formatNumber(claimableCount)} claims`}
            className={styles.briefingHeader}
          />
          <PanelStatGrid items={dashboardBriefing.stats} columns={4} className={styles.briefingStats} />
          <div className={styles.briefingActionGrid} data-command-briefing="true">
            {dashboardBriefing.actions.map((action) => (
              <FeedCardShell
                key={action.id}
                tone={action.tone}
                title={action.title}
                meta={<Badge tone={action.tone}>{action.badgeLabel}</Badge>}
                body={
                  <div className={styles.briefingCardBody}>
                    <p className={styles.briefingEyebrow}>{action.eyebrow}</p>
                    <p className={styles.briefingDetail}>{action.detail}</p>
                  </div>
                }
                footer={
                  <div className={styles.briefingFooter}>
                    <Button
                      type="button"
                      size="small"
                      data-briefing-action={action.id}
                      disabled={isBriefingActionBusy(action)}
                      onClick={() => void runBriefingAction(action)}
                    >
                      {action.ctaLabel}
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      </SectionCard>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          <SectionCard
            kicker="City Command Deck"
            title="Atlas district view"
            aside={<Badge tone={activeUpgrade ? "warning" : "success"}>{activeUpgrade ? "Construction live" : "Districts stable"}</Badge>}
            className={styles.cityStageCard}
          >
            <div className={styles.cityStageLayout} data-dashboard-stage="true">
              <div className={styles.cityStageCanvas}>
                <div className={styles.cityStageAtmosphere}>
                  <span className={styles.cityStageLabel}>Frontier city atlas</span>
                  <strong className={styles.cityStageFocus}>{selectedDistrict?.label ?? "District focus"}</strong>
                  <p className={styles.cityStageCopy}>Tap a node; details move to the rail.</p>
                </div>
                <div className={styles.cityStageCompass}>
                  <span>North Watch</span>
                  <strong>
                    {state.city.coordinates.x}, {state.city.coordinates.y}
                  </strong>
                </div>
                {cityStageNodes.map((node) => (
                  <button
                    key={node.type}
                    type="button"
                    data-city-node={node.type}
                    className={[
                      styles.cityNode,
                      node.status === "active" ? styles.cityNodeActive : "",
                      node.status === "selected" ? styles.cityNodeSelected : "",
                      styles[`cityNodeTone${node.tone[0].toUpperCase()}${node.tone.slice(1)}` as keyof typeof styles],
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        "--node-x": `${node.x}%`,
                        "--node-y": `${node.y}%`,
                      } as CSSProperties
                    }
                    onClick={() => setSelectedDistrictType(node.type)}
                  >
                    <img
                      src={node.iconSrc}
                      alt=""
                      aria-hidden="true"
                      className={styles.cityNodeIcon}
                    />
                    <span className={styles.cityNodeLevel}>L{node.level}</span>
                    <strong className={styles.cityNodeTitle}>{node.label}</strong>
                    <span className={styles.cityNodeHint}>{node.hint}</span>
                  </button>
                ))}
                <div className={styles.cityStageFooter}>
                  <article className={styles.cityFooterCard}>
                    <span className={styles.statLabel}>Advisor</span>
                    <strong className={styles.cityFooterTitle}>Logistics Marshal</strong>
                    <p className={styles.stackHint}>{cityAdvisorBrief}</p>
                  </article>
                  <article className={styles.cityFooterCard}>
                    <span className={styles.statLabel}>Season</span>
                    <strong className={styles.cityFooterTitle}>Summer campaign</strong>
                    <p className={styles.stackHint}>Queues + doctrine + march.</p>
                  </article>
                </div>
              </div>

              <aside className={styles.cityStageSidebar}>
                <SectionHeaderBlock
                  kicker="District Readout"
                  title={selectedDistrict?.label ?? "No district selected"}
                  lead={selectedDistrict?.description ?? "Select a district node to inspect queue state, cost, and next command."}
                  aside={selectedDistrict ? <Badge tone={selectedDistrict.isUpgradeActive ? "warning" : "info"}>L{selectedDistrict.level}</Badge> : null}
                  className={styles.cityStageSidebarHeader}
                />
                {selectedDistrict ? (
                  <>
                    <PanelStatGrid items={selectedDistrictStats} columns={3} className={styles.cityStageStats} />
                    <div className={styles.cityStageCosts}>
                      {Object.entries(selectedDistrict.upgradeCost).map(([resource, amount]) => (
                        <div key={resource} className={styles.cityStageCostRow}>
                          <span className={styles.operationsLabel}>{resource}</span>
                          <strong>{formatNumber(amount)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className={styles.cityStageActions}>
                      <Button
                        type="button"
                        disabled={
                          !selectedDistrict ||
                          isUpgrading ||
                          (Boolean(activeUpgrade) && !selectedDistrict.isUpgradeActive) ||
                          selectedDistrict.isUpgradeActive
                        }
                        onClick={() => selectedDistrict && upgrade(selectedDistrict.type as BuildingType)}
                      >
                        {selectedDistrict.isUpgradeActive ? "Construction live" : activeUpgrade ? "Queue locked" : "Upgrade district"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => navigate("/app/map")}>
                        Open Strategic Map
                      </Button>
                    </div>
                  </>
                ) : null}
              </aside>
            </div>
          </SectionCard>

          <SectionCard
            kicker="Combat Intelligence"
            title="City power breakdown"
            aside={<Badge tone="warning">{formatNumber(state.city.attackPower + state.city.defensePower)} total power</Badge>}
          >
            {(() => {
              const barracksLevel = state.city.buildings.find((b) => b.type === "BARRACKS")?.level ?? 0;
              const academyLevel  = state.city.buildings.find((b) => b.type === "ACADEMY")?.level ?? 0;
              const militaryDrill = state.city.research.find((r) => r.type === "MILITARY_DRILL")?.level ?? 0;
              const cityPlanning  = state.city.research.find((r) => r.type === "CITY_PLANNING")?.level ?? 0;
              const trainingSpeedPct = Math.round(((1 + Math.max(0, barracksLevel - 1) * 0.12) * (1 + militaryDrill * 0.08) - 1) * 100);
              const researchSpeedPct = Math.round(Math.max(0, academyLevel - 1) * 10);
              return (
                <div className={styles.combatGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Attack power</span>
                    <strong className={styles.statValue}>{formatNumber(state.city.attackPower)}</strong>
                    <span className={styles.stackHint}>Garrison + Forge + research</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Defense power</span>
                    <strong className={styles.statValue}>{formatNumber(state.city.defensePower)}</strong>
                    <span className={styles.stackHint}>Garrison + Wall + Stonework</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Vision radius</span>
                    <strong className={styles.statValue}>{formatNumber(state.city.visionRadius)}</strong>
                    <span className={styles.stackHint}>Watchtower + Scouting</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Hospital cap</span>
                    <strong className={styles.statValue}>{formatNumber(state.city.hospitalHealingCapacity)}</strong>
                    <span className={styles.stackHint}>troops healed / tick</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Train speed</span>
                    <strong className={styles.statValue}>{trainingSpeedPct > 0 ? `+${trainingSpeedPct}%` : "Base"}</strong>
                    <span className={styles.stackHint}>Barracks L{barracksLevel} · Drill L{militaryDrill}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Upgrade speed</span>
                    <strong className={styles.statValue}>{cityPlanning > 0 ? `-${cityPlanning * 10}%` : "Base"}</strong>
                    <span className={styles.stackHint}>City Planning L{cityPlanning}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Research speed</span>
                    <strong className={styles.statValue}>{researchSpeedPct > 0 ? `+${researchSpeedPct}%` : "Base"}</strong>
                    <span className={styles.stackHint}>Academy L{academyLevel}</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Open marches</span>
                    <strong className={styles.statValue}>{formatNumber(state.city.openMarchCount)}</strong>
                    <span className={styles.stackHint}>Town Hall march cap</span>
                  </div>
                </div>
              );
            })()}
          </SectionCard>

          <SectionCard kicker={copy.dashboard.tasks} title="First 5-minute flow" aside={<Badge tone={tasksQuery.data?.tutorialCompleted ? "success" : "warning"}>{tasksQuery.data?.tutorialCompleted ? "Complete" : "Open"}</Badge>}>
            <div className={styles.taskList}>
              {[...tutorialTasks.slice(0, 4), ...dailyTasks.slice(0, 2)].map((task) => (
                <article key={task.id} className={styles.taskCard}>
                  <div className={styles.taskMeta}>
                    <strong>{task.title}</strong>
                    <Badge tone={task.isClaimed ? "info" : task.isCompleted ? "success" : "warning"}>{task.progress}/{task.target}</Badge>
                  </div>
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
              <div className={styles.actionRow}>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/research")}>
                  Open Research Chamber
                </Button>
              </div>
            </SectionCard>

            {woundedTotal > 0 || state.city.hospitalHealingCapacity > 0 ? (
              <SectionCard
                kicker="Hospital"
                title="Wounded recovery"
                aside={
                  woundedTotal > 0 ? (
                    <Badge tone="warning">{formatNumber(woundedTotal)} wounded</Badge>
                  ) : (
                    <Badge tone="success">Garrison healthy</Badge>
                  )
                }
              >
                <div className={styles.compactList}>
                  {state.city.woundedTroops.INFANTRY > 0 && (
                    <div className={styles.taskMeta}>
                      <span className={styles.operationsLabel}>Infantry</span>
                      <strong>{formatNumber(state.city.woundedTroops.INFANTRY)} recovering</strong>
                    </div>
                  )}
                  {state.city.woundedTroops.ARCHER > 0 && (
                    <div className={styles.taskMeta}>
                      <span className={styles.operationsLabel}>Archers</span>
                      <strong>{formatNumber(state.city.woundedTroops.ARCHER)} recovering</strong>
                    </div>
                  )}
                  {state.city.woundedTroops.CAVALRY > 0 && (
                    <div className={styles.taskMeta}>
                      <span className={styles.operationsLabel}>Cavalry</span>
                      <strong>{formatNumber(state.city.woundedTroops.CAVALRY)} recovering</strong>
                    </div>
                  )}
                  {woundedTotal === 0 && (
                    <p className={styles.stackHint}>No wounded troops in the recovery ward.</p>
                  )}
                </div>
                <p className={styles.stackHint}>
                  Heal capacity: {formatNumber(state.city.hospitalHealingCapacity)} troops/tick. Upgrade Hospital and research Medicine to increase recovery speed.
                </p>
              </SectionCard>
            ) : null}

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

            <SectionCard kicker="Live board" title="Events and season standings" aside={<Badge tone="success">{formatNumber(seasonPass?.xp ?? 0)} xp</Badge>}>
              <div className={styles.compactList}>
                {liveEvents.slice(0, 3).map((event) => (
                  <div key={event.eventKey} className={styles.taskMeta}>
                    <strong>{event.label}</strong>
                    <span className={styles.stackHint}>{event.score}/{event.target}</span>
                  </div>
                ))}
                <p className={styles.stackHint}>{seasonPass ? `${seasonPass.tiers.filter((tier) => tier.claimedFree).length} free tiers unlocked.` : "Season data is loading."}</p>
              </div>
              <div className={styles.actionRow}>
                <Button type="button" variant="secondary" onClick={() => navigate("/app/leaderboards")}>
                  Open Rankings
                </Button>
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
          <SectionCard kicker="Aegis Command" title="Queue and dispatch rail" aside={<Badge tone={activeUpgrade || activeResearch ? "warning" : "success"}>{activeUpgrade || activeResearch ? "Live" : "Stable"}</Badge>}>
            <PanelStatGrid items={stageQueueCards} columns={1} className={styles.cityRailList} />
          </SectionCard>

          <SectionCard kicker={copy.dashboard.commanders} title={primaryCommander?.name ?? "No commander"} aside={<Badge tone="info">L{primaryCommander?.level ?? 0}</Badge>}>
            <p className={styles.stackHint}>XP {formatNumber(primaryCommander?.xp ?? 0)}/{formatNumber(primaryCommander?.xpToNextLevel ?? 0)} | Stars {formatNumber(primaryCommander?.starLevel ?? 0)}</p>
            <div className={styles.actionRow}><Button type="button" onClick={() => openCommanderPanel(primaryCommander?.id)}>Open Commander Panel</Button></div>
          </SectionCard>

          <SectionCard kicker={copy.dashboard.mailbox} title="Latest dispatches" aside={<Badge tone="warning">{unreadMailboxCount} new</Badge>}>
            <div className={styles.compactList}>
              {mailboxEntries.slice(0, 4).map((entry) => <div key={entry.id} className={styles.taskMeta}><strong>{entry.title}</strong><span className={styles.stackHint}>{entry.canClaim ? "Reward waiting" : "Report archived"}</span></div>)}
            </div>
            <div className={styles.actionRow}><Button type="button" variant="secondary" onClick={() => navigate("/app/messages")}>Open Message Center</Button></div>
          </SectionCard>
          {bootstrap.storeEnabled ? (
            <SectionCard kicker={copy.dashboard.store} title="Store summary" aside={<Badge tone="success">{storeOffers.length} offers</Badge>}>
              <div className={styles.compactList}>
                {storeOffers.slice(0, 3).map((offer) => <div key={offer.offerId} className={styles.taskMeta}><strong>{offer.title}</strong><span className={styles.stackHint}>{offer.productIds.length} products</span></div>)}
              </div>
              <div className={styles.actionRow}><Button type="button" variant="secondary" onClick={() => navigate("/app/market")}>Open Imperial Market</Button></div>
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
