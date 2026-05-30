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
  return primaryLine ?? "Kaynak, eşya ve sezon ilerlemesi hazır.";
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
  const nextTier = state.alliance ? `${formatNumber(state.alliance.memberCount)} kişilik toy` : "Bağımsız oba";
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
      label: "Ödül",
      value: formatNumber(claimableCount),
      note: `${allTasks.filter((task) => task.isCompleted && !task.isClaimed).length} görev ve ${mailboxEntries.filter((entry) => entry.canClaim).length} ulak ödülü hazır.`,
      tone: claimableCount > 0 ? "success" : "default",
    },
    {
      id: "idle-lanes",
      label: "Boş hat",
      value: `${idleLaneCount}/3`,
      note: idleLaneCount > 0 ? "Boş kuyruk kısa oturum temposunu düşürür." : "Yapı, kışla ve bilge ocağı çalışıyor.",
      tone: idleLaneCount > 0 ? "warning" : "success",
    },
    {
      id: "event-pace",
      label: "Etkinlik",
      value: unfinishedEvent ? `${formatNumber(unfinishedEvent.score)}/${formatNumber(unfinishedEvent.target)}` : "Sakin",
      note: unfinishedEvent
        ? `${formatNumber(Math.max(0, unfinishedEvent.target - unfinishedEvent.score))} puan kaldı: ${unfinishedEvent.label}.`
        : "Şu an canlı etkinlik baskısı yok.",
      tone: unfinishedEvent ? "info" : "default",
    },
    {
      id: "alliance-pulse",
      label: "Toy nabzı",
      value: state.alliance ? `${formatNumber(state.alliance.memberCount)} üye` : "Bağımsız",
      note: state.alliance ? nextTier : "Ortak görüş, sohbet ve işaretler en güçlü dönüş sebebi.",
      tone: state.alliance ? "info" : "warning",
    },
  ];

  const actions: DashboardBriefingAction[] = [];

  if (claimableMailbox) {
    actions.push({
      id: `claim-mailbox-${claimableMailbox.id}`,
      eyebrow: "Ulak ödülü",
      title: claimableMailbox.title,
      detail: "Kazanılmış ulak ödülü bekliyor. Yeni döngüye geçmeden önce ambara indir.",
      impact: describeReward(claimableMailbox.reward),
      badgeLabel: "Hemen",
      tone: "success",
      ctaLabel: "Ulak ödülünü al",
      command: { type: "claim_mailbox", mailboxId: claimableMailbox.id },
    });
  }

  if (claimableTask) {
    actions.push({
      id: `claim-task-${claimableTask.id}`,
      eyebrow: claimableTask.kind === "TUTORIAL" ? "İlk oba ödülü" : "Günlük ödül",
      title: claimableTask.title,
      detail: `${claimableTask.progress}/${claimableTask.target} ilerleme tamam. Ödülü al, beş dakikalık döngü canlı kalsın.`,
      impact: describeReward(claimableTask.reward),
      badgeLabel: "Ödül",
      tone: "success",
      ctaLabel: "Ödülü al",
      command: { type: "claim_task", taskId: claimableTask.id },
    });
  }

  if (upgradeTarget) {
    actions.push({
      id: `upgrade-${upgradeTarget.type}`,
      eyebrow: "Yapı hattı",
      title: `${upgradeTarget.label} yükselt`,
      detail: `Yapı kuyruğu boş. ${upgradeTarget.label} hemen L${upgradeTarget.nextLevel} olabilir.`,
      impact: "Tek yapı buyruğu, sen haritadayken obanın büyümesini sürdürür.",
      badgeLabel: "Büyüme",
      tone: "warning",
      ctaLabel: `L${upgradeTarget.nextLevel} başlat`,
      command: { type: "upgrade", buildingType: upgradeTarget.type },
    });
  }

  if (trainingTarget) {
    actions.push({
      id: `train-${trainingTarget.troopType}`,
      eyebrow: "Kışla temposu",
      title: `${trainingTarget.label} kuyruğa al`,
      detail: `Kışla açık. ${trainingTarget.quantity} birliklik yeni talim, sen sefer veya toy hattına geçerken ilerlemeyi sürdürür.`,
      impact: "Kısa oturumlu stratejide kışlanın arkada çalışması oyunu canlı tutar.",
      badgeLabel: "Kuyruk",
      tone: "warning",
      ctaLabel: `x${trainingTarget.quantity} talim`,
      command: { type: "train", troopType: trainingTarget.troopType, quantity: trainingTarget.quantity },
    });
  }

  if (suggestedResearch) {
    actions.push({
      id: `research-${suggestedResearch.type}`,
      eyebrow: "Töre hattı",
      title: `${suggestedResearch.label} başlat`,
      detail: "Bilge ocağı sessiz. Tek dokunuşla boş zamanı güce çevir.",
      impact: `${suggestedResearch.label} hâlâ sınırının altında ve kısa girişlerde bile makro eğriyi taşır.`,
      badgeLabel: "Töre",
      tone: "info",
      ctaLabel: "Töre aç",
      command: { type: "research", researchType: suggestedResearch.type },
    });
  }

  if (unfinishedEvent) {
    actions.push({
      id: `event-${unfinishedEvent.eventKey}`,
      eyebrow: "Canlı sefer",
      title: unfinishedEvent.label,
      detail: `Etkinlik hattında ${formatNumber(Math.max(0, unfinishedEvent.target - unfinishedEvent.score))} puan kaldı. Obadan çıkıp kısa bir sefer döngüsü yapmanın en net sebebi bu.`,
      impact: "Canlı etkinlik baskısı, güzel bir ekranı geri dönülen alışkanlığa çevirir.",
      badgeLabel: "Canlı",
      tone: "info",
      ctaLabel: "Sefer haritası",
      command: { type: "open_route", route: "/app/map" },
    });
  }

  if (unreadMailboxCount > 0 && !claimableMailbox) {
    actions.push({
      id: "open-messages",
      eyebrow: "Ulak hattı",
      title: `${formatNumber(unreadMailboxCount)} okunmamış ulak`,
      detail: "Rapor, keşif dönüşü veya alınacak istihbarat arşivde bekliyor. Sonraki hamleden önce oku.",
      impact: "Ara verdikten sonra en hızlı durum bilgisi ulak kayıtlarından gelir.",
      badgeLabel: "İstihbarat",
      tone: "info",
      ctaLabel: "Ulak odası",
      command: { type: "open_route", route: "/app/messages" },
    });
  }

  if (!state.alliance) {
    actions.push({
      id: "join-alliance",
      eyebrow: "Toy döngüsü",
      title: "Toy meclisini aç",
      detail: "Tek oba düzeni stabil. Bir sonraki büyük güç, yeni stat paneli değil koordinasyon.",
      impact: "Sohbet, işaretler ve ortak görüş kısa girişleri daha bağlayıcı yapar.",
      badgeLabel: "Toy",
      tone: "info",
      ctaLabel: "Toy bul",
      command: { type: "open_route", route: "/app/alliance" },
    });
  } else {
    actions.push({
      id: "alliance-pulse",
      eyebrow: "Toy nabzı",
      title: `[${state.alliance.tag}] ${state.alliance.name}`,
      detail: `${formatNumber(state.alliance.memberCount)} üye hızlı girişi ortak harekete çevirebilir. Sonraki seferden önce meclise bak.`,
      impact: "Topluluk baskısı, yalnız tarayıcı stratejisi klonlarına karşı gerçek savunmadır.",
      badgeLabel: "Toy",
      tone: "info",
      ctaLabel: "Toy meclisi",
      command: { type: "open_route", route: "/app/alliance" },
    });
  }

  if (state.city.openMarchCount === 0) {
    actions.push({
      id: "frontier-sweep",
      eyebrow: "Bozkır taraması",
      title: "Bir seferi harekete geçir",
      detail: "Aktif sefer yok. Kısa bir tarama, hesap hissini girişler arasında canlı tutar.",
      impact: "Kısa oturumlu stratejide boş birlik, ölü ekran süresidir.",
      badgeLabel: "Harita",
      tone: "warning",
      ctaLabel: "Haritayı tara",
      command: { type: "open_route", route: "/app/map" },
    });
  }

  let headline = "Sonraki beş dakikayı çalıştır";
  let lead =
    "Kazanılanı al, boş kuyruğu doldur, sonra bozkır ya da toy hattına tek bilinçli hamle yap.";
  let badgeLabel = "Dengeli an";
  let badgeTone: BriefingTone = "success";

  if (claimableCount > 0) {
    headline = "Çıkmadan önce tahtayı topla";
    lead =
      "Hazır ödüller bekliyor. Önce onları al, sonra boş hatları doldur ki oba sen çıkınca da büyüsün.";
    badgeLabel = "Toplama anı";
    badgeTone = "success";
  } else if (idleLaneCount >= 2) {
    headline = "Boş hatları doldur";
    lead =
      "Obada yapı, kışla veya bilge ocağı fazla boş kalmış. Kısa oturumdaki en hızlı kazanım bunu düzeltmek.";
    badgeLabel = "Kurulum anı";
    badgeTone = "warning";
  } else if (unfinishedEvent) {
    headline = `${unfinishedEvent.label} sıcakken ilerlet`;
    lead =
      "Oba çekirdeği yeterince stabil. Şimdi sonraki dokunuşu canlı etkinlik belirlemeli; kısa sefer döngüsü menü gezmekten değerli.";
    badgeLabel = "Baskı anı";
    badgeTone = "info";
  } else if (!state.alliance) {
    headline = "Oturuma toy döngüsü ekle";
    lead =
      "Buyruk panosu okunuyor. Sıradaki kazanım, oyuncuya sadece sayaçlar için değil insanlar için de dönme sebebi vermek.";
    badgeLabel = "Toy anı";
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
