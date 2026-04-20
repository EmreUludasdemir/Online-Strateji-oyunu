import type {
  BuildingType,
  GameStateResponse,
  LiveEventView,
  MailboxEntryView,
  ResearchType,
  TaskView,
  TroopType,
} from "@frontier/shared";

import { formatNumber } from "../lib/formatters";
import { summarizeRewardLines } from "../lib/rewardSummaries";
import type { PanelStatItem } from "../components/ui/CommandSurface";

type BriefingTone = "info" | "success" | "warning";

type DashboardBriefingRoute = "/app/alliance" | "/app/leaderboards" | "/app/map" | "/app/messages" | "/app/research";

export type DashboardBriefingCommand =
  | { type: "claim_task"; taskId: string }
  | { type: "claim_mailbox"; mailboxId: string }
  | { type: "open_route"; route: DashboardBriefingRoute }
  | { type: "upgrade"; buildingType: BuildingType }
  | { type: "train"; troopType: TroopType; quantity: number }
  | { type: "research"; researchType: ResearchType };

export interface DashboardBriefingAction {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  impact: string;
  badgeLabel: string;
  tone: BriefingTone;
  ctaLabel: string;
  command: DashboardBriefingCommand;
}

export interface DashboardBriefingResult {
  headline: string;
  lead: string;
  badgeLabel: string;
  badgeTone: BriefingTone;
  stats: PanelStatItem[];
  actions: DashboardBriefingAction[];
}

interface DashboardBriefingInput {
  state: GameStateResponse;
  tutorialTasks: TaskView[];
  dailyTasks: TaskView[];
  mailboxEntries: MailboxEntryView[];
  unreadMailboxCount: number;
  liveEvents: LiveEventView[];
}

function selectUpgradeTarget(state: GameStateResponse): GameStateResponse["city"]["buildings"][number] | null {
  const buildings = state.city.buildings;
  const townHall = buildings.find((building) => building.type === "TOWN_HALL");
  const supportPriority = ["TOWN_HALL", "BARRACKS", "ACADEMY", "WATCHTOWER", "HOSPITAL"] as const;
  const priorityBuilding = supportPriority
    .map((type) => buildings.find((building) => building.type === type))
    .find(Boolean);

  if (priorityBuilding && townHall && townHall.level <= priorityBuilding.level) {
    return townHall;
  }

  return [...buildings].sort((left, right) => left.level - right.level || left.nextLevel - right.nextLevel)[0] ?? townHall ?? null;
}

function selectTrainingTarget(state: GameStateResponse): { troopType: TroopType; label: string; quantity: number } | null {
  const preferredTroop =
    state.city.troops.find((troop) => troop.type === "INFANTRY") ?? [...state.city.troops].sort((left, right) => left.quantity - right.quantity)[0];

  if (!preferredTroop) {
    return null;
  }

  const quantity = preferredTroop.type === "CAVALRY" ? 6 : 12;

  return {
    troopType: preferredTroop.type,
    label: preferredTroop.label,
    quantity,
  };
}

function describeReward(reward: TaskView["reward"] | MailboxEntryView["reward"]): string {
  const [primaryLine] = summarizeRewardLines(reward);
  return primaryLine ?? "Resources, items, and season momentum are ready to land.";
}

export function buildDashboardBriefing({
  state,
  tutorialTasks,
  dailyTasks,
  mailboxEntries,
  unreadMailboxCount,
  liveEvents,
}: DashboardBriefingInput): DashboardBriefingResult {
  const allTasks = [...tutorialTasks, ...dailyTasks];
  const claimableTask = allTasks.find((task) => task.isCompleted && !task.isClaimed) ?? null;
  const claimableMailbox = mailboxEntries.find((entry) => entry.canClaim) ?? null;
  const unfinishedEvent =
    [...liveEvents]
      .filter((event) => event.score < event.target)
      .sort((left, right) => right.score / right.target - left.score / left.target || (left.target - left.score) - (right.target - right.score))[0] ?? null;
  const idleLaneCount =
    Number(!state.city.activeUpgrade) + Number(!state.city.activeTraining) + Number(!state.city.activeResearch);
  const nextTier = state.alliance ? `Alliance of ${formatNumber(state.alliance.memberCount)}` : "Independent province";
  const upgradeTarget = !state.city.activeUpgrade ? selectUpgradeTarget(state) : null;
  const trainingTarget = !state.city.activeTraining ? selectTrainingTarget(state) : null;
  const suggestedResearch =
    !state.city.activeResearch
      ? state.city.research.find((entry) => entry.level < entry.maxLevel) ?? null
      : null;
  const claimableCount =
    allTasks.filter((task) => task.isCompleted && !task.isClaimed).length + mailboxEntries.filter((entry) => entry.canClaim).length;
  const stats: PanelStatItem[] = [
    {
      id: "claimables",
      label: "Claimables",
      value: formatNumber(claimableCount),
      note: `${allTasks.filter((task) => task.isCompleted && !task.isClaimed).length} task rewards and ${mailboxEntries.filter((entry) => entry.canClaim).length} dispatch rewards are ready.`,
      tone: claimableCount > 0 ? "success" : "default",
    },
    {
      id: "idle-lanes",
      label: "Idle lanes",
      value: `${idleLaneCount}/3`,
      note: idleLaneCount > 0 ? "Idle queues are the fastest place to lose short-session momentum." : "Build, barracks, and academy are all moving.",
      tone: idleLaneCount > 0 ? "warning" : "success",
    },
    {
      id: "event-pace",
      label: "Event pace",
      value: unfinishedEvent ? `${formatNumber(unfinishedEvent.score)}/${formatNumber(unfinishedEvent.target)}` : "Quiet",
      note: unfinishedEvent
        ? `${formatNumber(Math.max(0, unfinishedEvent.target - unfinishedEvent.score))} points left in ${unfinishedEvent.label}.`
        : "No live-event pressure is currently ahead of you.",
      tone: unfinishedEvent ? "info" : "default",
    },
    {
      id: "alliance-pulse",
      label: "Alliance pulse",
      value: state.alliance ? `${formatNumber(state.alliance.memberCount)} members` : "Independent",
      note: state.alliance ? nextTier : "Shared vision, chat, and markers are still the strongest retention lever.",
      tone: state.alliance ? "info" : "warning",
    },
  ];

  const actions: DashboardBriefingAction[] = [];

  if (claimableMailbox) {
    actions.push({
      id: `claim-mailbox-${claimableMailbox.id}`,
      eyebrow: "Archive warrant",
      title: claimableMailbox.title,
      detail: "A dispatch reward is already earned. Claim it before opening a new loop so the city starts compounding immediately.",
      impact: describeReward(claimableMailbox.reward),
      badgeLabel: "Instant",
      tone: "success",
      ctaLabel: "Claim dispatch",
      command: { type: "claim_mailbox", mailboxId: claimableMailbox.id },
    });
  }

  if (claimableTask) {
    actions.push({
      id: `claim-task-${claimableTask.id}`,
      eyebrow: claimableTask.kind === "TUTORIAL" ? "Onboarding payout" : "Daily payout",
      title: claimableTask.title,
      detail: `${claimableTask.progress}/${claimableTask.target} progress is complete. Clear the reward now and keep the five-minute loop feeling responsive.`,
      impact: describeReward(claimableTask.reward),
      badgeLabel: "Reward",
      tone: "success",
      ctaLabel: "Claim reward",
      command: { type: "claim_task", taskId: claimableTask.id },
    });
  }

  if (upgradeTarget) {
    actions.push({
      id: `upgrade-${upgradeTarget.type}`,
      eyebrow: "Growth lane",
      title: `Raise ${upgradeTarget.label}`,
      detail: `The build queue is idle. ${upgradeTarget.label} can move to L${upgradeTarget.nextLevel} right now.`,
      impact: "One building order keeps the city curve climbing while the rest of the session happens elsewhere.",
      badgeLabel: "Compounding",
      tone: "warning",
      ctaLabel: `Start L${upgradeTarget.nextLevel}`,
      command: { type: "upgrade", buildingType: upgradeTarget.type },
    });
  }

  if (trainingTarget) {
    actions.push({
      id: `train-${trainingTarget.troopType}`,
      eyebrow: "Barracks tempo",
      title: `Queue ${trainingTarget.label}`,
      detail: `Barracks are open. A fresh ${trainingTarget.quantity}-unit batch restores passive progress while you step into the frontier or alliance rail.`,
      impact: "Short-session strategy games feel alive when the barracks are always burning in the background.",
      badgeLabel: "Queue",
      tone: "warning",
      ctaLabel: `Queue x${trainingTarget.quantity}`,
      command: { type: "train", troopType: trainingTarget.troopType, quantity: trainingTarget.quantity },
    });
  }

  if (suggestedResearch) {
    actions.push({
      id: `research-${suggestedResearch.type}`,
      eyebrow: "Doctrine lane",
      title: `Start ${suggestedResearch.label}`,
      detail: "The academy is quiet. Spend one tap on doctrine so the city keeps converting downtime into leverage.",
      impact: `${suggestedResearch.label} is still below its cap and keeps the macro curve moving even in short logins.`,
      badgeLabel: "Doctrine",
      tone: "info",
      ctaLabel: "Open doctrine",
      command: { type: "research", researchType: suggestedResearch.type },
    });
  }

  if (unfinishedEvent) {
    actions.push({
      id: `event-${unfinishedEvent.eventKey}`,
      eyebrow: "Live ops",
      title: unfinishedEvent.label,
      detail: `${formatNumber(Math.max(0, unfinishedEvent.target - unfinishedEvent.score))} points remain in the current event track. This is the clearest reason to leave the dashboard and do one short frontier loop.`,
      impact: "Live-event pressure is what turns a polished dashboard into a returning habit.",
      badgeLabel: "Live",
      tone: "info",
      ctaLabel: "Open frontier map",
      command: { type: "open_route", route: "/app/map" },
    });
  }

  if (unreadMailboxCount > 0 && !claimableMailbox) {
    actions.push({
      id: "open-messages",
      eyebrow: "Dispatch rail",
      title: `${formatNumber(unreadMailboxCount)} unread dispatches`,
      detail: "Reports, scout returns, or claimable intel are waiting in the archive. Read them before choosing the next move.",
      impact: "Unread dispatches are your fastest source of situational clarity after a gap between sessions.",
      badgeLabel: "Intel",
      tone: "info",
      ctaLabel: "Open message center",
      command: { type: "open_route", route: "/app/messages" },
    });
  }

  if (!state.alliance) {
    actions.push({
      id: "join-alliance",
      eyebrow: "Community loop",
      title: "Open the alliance room",
      detail: "The solo city board is stable enough. The next big product lever is still coordination, not another static stat panel.",
      impact: "Alliance chat, markers, and shared vision make short check-ins much stickier.",
      badgeLabel: "Social",
      tone: "info",
      ctaLabel: "Find an alliance",
      command: { type: "open_route", route: "/app/alliance" },
    });
  } else {
    actions.push({
      id: "alliance-pulse",
      eyebrow: "Alliance pulse",
      title: `[${state.alliance.tag}] ${state.alliance.name}`,
      detail: `${formatNumber(state.alliance.memberCount)} members can turn a quick login into coordinated movement. Check the room before the next march.`,
      impact: "Community pressure is the real moat against cleaner but lonelier browser-strategy clones.",
      badgeLabel: "Social",
      tone: "info",
      ctaLabel: "Open alliance room",
      command: { type: "open_route", route: "/app/alliance" },
    });
  }

  if (state.city.openMarchCount === 0) {
    actions.push({
      id: "frontier-sweep",
      eyebrow: "Frontier sweep",
      title: "Put one march in motion",
      detail: "No marches are currently active. A short sweep keeps the account feeling alive between check-ins.",
      impact: "For a short-session MMORTS loop, idle troops are dead screen time.",
      badgeLabel: "Map",
      tone: "warning",
      ctaLabel: "Sweep map",
      command: { type: "open_route", route: "/app/map" },
    });
  }

  let headline = "Keep the next five minutes working";
  let lead =
    "Claim what is already earned, refill any idle queue, and then spend one deliberate tap on either the frontier or the alliance rail.";
  let badgeLabel = "Stable window";
  let badgeTone: BriefingTone = "success";

  if (claimableCount > 0) {
    headline = "Harvest the board before you leave";
    lead =
      "Immediate rewards are waiting. Clear them first, then refill idle queues so the city keeps compounding after this login ends.";
    badgeLabel = "Harvest window";
    badgeTone = "success";
  } else if (idleLaneCount >= 2) {
    headline = "Refill the idle lanes";
    lead =
      "The city has too much downtime in build, barracks, or academy. Fixing that is the fastest retention gain you can create in one short session.";
    badgeLabel = "Setup window";
    badgeTone = "warning";
  } else if (unfinishedEvent) {
    headline = `Push ${unfinishedEvent.label} while the board is warm`;
    lead =
      "Your city core is stable enough that live-event pressure should now dictate the next tap. One short frontier loop is more valuable than browsing deeper menus.";
    badgeLabel = "Pressure window";
    badgeTone = "info";
  } else if (!state.alliance) {
    headline = "Add a social loop to the session";
    lead =
      "The command board already reads well. The next product gain comes from giving players a reason to return for other people, not only for timers.";
    badgeLabel = "Community window";
    badgeTone = "info";
  }

  return {
    headline,
    lead,
    badgeLabel,
    badgeTone,
    stats,
    actions: actions.slice(0, 4),
  };
}
