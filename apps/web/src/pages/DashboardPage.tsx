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

  const tutorialTasks = tasksQuery.data?.tutorial ?? [];
  const dailyTasks = tasksQuery.data?.daily ?? [];
  const inventoryItems = inventoryQuery.data?.items ?? [];
  const mailboxEntries = mailboxQuery.data?.entries ?? [];
  const unreadMailboxCount = mailboxQuery.data?.unreadCount ?? 0;
  const liveEvents = eventsQuery.data?.events ?? [];
  const activeUpgrade = state.city.activeUpgrade;
  const activeTraining = state.city.activeTraining;
  const activeResearch = state.city.activeResearch;
  const totalStores = Object.values(state.city.resources).reduce((sum, value) => sum + value, 0);
  const primaryCommander = state.city.commanders.find((commander) => commander.isPrimary) ?? state.city.commanders[0];
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
  const provinceStatus = state.city.peaceShieldUntil ? "Peace shield active" : "Battle ready";
  const allTasks = [...tutorialTasks, ...dailyTasks];
  const claimableCount =
    allTasks.filter((task) => task.isCompleted && !task.isClaimed).length +
    mailboxEntries.filter((entry) => entry.canClaim).length;
  const idleQueueCount = Number(!activeUpgrade) + Number(!activeTraining) + Number(!activeResearch);
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

      <div className={styles.dashboardDetailRow}>
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
      </div>
    </section>
  );
}
