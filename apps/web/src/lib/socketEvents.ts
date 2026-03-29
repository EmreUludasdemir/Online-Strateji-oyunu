import type { SocketEventType } from "@frontier/shared";

const SOCKET_EVENT_TYPES: SocketEventType[] = [
  "city.updated",
  "upgrade.completed",
  "training.completed",
  "research.completed",
  "march.created",
  "march.updated",
  "battle.resolved",
  "report.created",
  "fog.updated",
  "poi.updated",
  "map.updated",
  "alliance.updated",
  "task.updated",
  "inventory.updated",
  "commander.updated",
  "scout.completed",
  "rally.updated",
  "mailbox.updated",
  "store.updated",
  "event.updated",
  "leaderboard.updated",
];

export interface ParsedSocketEvent {
  type: SocketEventType;
}

export interface SocketToastDescriptor {
  tone: "success" | "info" | "warning";
  title: string;
  body: string;
}

export function parseSocketEvent(raw: unknown): ParsedSocketEvent | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    return null;
  }

  const candidate = (raw as { type?: string }).type;
  if (!candidate || !SOCKET_EVENT_TYPES.includes(candidate as SocketEventType)) {
    return null;
  }

  return {
    type: candidate as SocketEventType,
  };
}

export function getInvalidationKeys(type: SocketEventType): string[][] {
  if (["city.updated", "upgrade.completed", "training.completed", "research.completed", "inventory.updated", "commander.updated"].includes(type)) {
    return [["game-state"]];
  }

  if (type === "task.updated") {
    return [["tasks"], ["events"]];
  }

  if (type === "inventory.updated") {
    return [["inventory"]];
  }

  if (type === "commander.updated") {
    return [["commanders"]];
  }

  if (["map.updated", "fog.updated", "poi.updated", "march.created", "march.updated", "rally.updated"].includes(type)) {
    return [["world-chunk"]];
  }

  if (["report.created", "battle.resolved"].includes(type)) {
    return [["battle-reports"], ["game-state"], ["world-chunk"]];
  }

  if (["mailbox.updated", "scout.completed"].includes(type)) {
    return [["mailbox"]];
  }

  if (type === "rally.updated") {
    return [["rallies"], ["alliance-state"]];
  }

  if (type === "store.updated") {
    return [["store-catalog"], ["entitlements"]];
  }

  if (["event.updated", "leaderboard.updated"].includes(type)) {
    return [["events"], ["leaderboard"]];
  }

  if (type === "alliance.updated") {
    return [["alliance-state"], ["game-state"]];
  }

  return [];
}

export function getSocketToast(type: SocketEventType): SocketToastDescriptor | null {
  switch (type) {
    case "upgrade.completed":
      return {
        tone: "success",
        title: "Upgrade Complete",
        body: "A new district upgrade is now available in the dashboard.",
      };
    case "training.completed":
      return {
        tone: "success",
        title: "Training Complete",
        body: "Fresh troops have marched out of the barracks.",
      };
    case "research.completed":
      return {
        tone: "info",
        title: "Research Complete",
        body: "The academy has recorded a new doctrine.",
      };
    case "battle.resolved":
      return {
        tone: "warning",
        title: "Battle Resolved",
        body: "A frontier clash has been added to your reports.",
      };
    case "scout.completed":
      return {
        tone: "info",
        title: "Scout Returned",
        body: "A new scout report is waiting in your inbox.",
      };
    case "mailbox.updated":
      return {
        tone: "info",
        title: "New Inbox Entry",
        body: "A reward or report is waiting for review.",
      };
    case "rally.updated":
      return {
        tone: "warning",
        title: "Rally Updated",
        body: "The alliance rally window has changed.",
      };
    default:
      return null;
  }
}
