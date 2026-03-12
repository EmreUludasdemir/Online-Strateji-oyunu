import { SOCKET_EVENT_TYPES, type SocketEventType } from "@frontier/shared";

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
    return [["events"], ["leaderboards"]];
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
        title: "İnşa tamamlandı",
        body: "Yeni bölge yükseltmesi divanda kullanıma açıldı.",
      };
    case "training.completed":
      return {
        tone: "success",
        title: "Talim bitti",
        body: "Kışladan yeni birlikler çıktı.",
      };
    case "research.completed":
      return {
        tone: "info",
        title: "Araştırma tamamlandı",
        body: "Akademi yeni doktrini kaydetti.",
      };
    case "battle.resolved":
      return {
        tone: "warning",
        title: "Sefer çözüldü",
        body: "Sınırda bir çatışma sonucu raporlara işlendi.",
      };
    case "scout.completed":
      return {
        tone: "info",
        title: "Keşif döndü",
        body: "Ulak kutusuna yeni bir keşif raporu geldi.",
      };
    case "mailbox.updated":
      return {
        tone: "info",
        title: "Yeni ulak kaydı",
        body: "Ödül veya rapor bekliyor.",
      };
    case "rally.updated":
      return {
        tone: "warning",
        title: "Ralli durumu güncellendi",
        body: "İttifak sefer penceresi değişti.",
      };
    default:
      return null;
  }
}
