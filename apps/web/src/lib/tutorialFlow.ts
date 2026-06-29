export type TutorialChapterId = "city_economy" | "army_march" | "province_expansion" | "complete";

export type TutorialStepId =
  | "welcome"
  | "resource_bar"
  | "open_city"
  | "upgrade_townhall"
  | "open_army"
  | "train_troops"
  | "open_map"
  | "select_province"
  | "scout_province"
  | "claim_or_influence"
  | "send_march"
  | "open_reports"
  | "read_report"
  | "completed";

export type TutorialRequirementType =
  | "manual_ack"
  | "visit_route"
  | "upgrade_started"
  | "training_started"
  | "map_opened"
  | "province_selected"
  | "province_scouted"
  | "province_expansion_action"
  | "march_sent"
  | "report_opened"
  | "complete";

export interface TutorialTarget {
  id: string;
  selector?: string;
  route?: string;
  label: string;
  placement?: "top" | "right" | "bottom" | "left" | "center";
}

export interface TutorialObjective {
  title: string;
  instruction: string;
  why: string;
}

export interface TutorialActionRequirement {
  type: TutorialRequirementType;
  route?: string;
  action?: string;
  targetId?: string;
}

export interface TutorialReward {
  label: string;
  detail: string;
}

export interface TutorialAdvisorMessage {
  speaker: "divan" | "kagan";
  text: string;
}

export interface TutorialStepDef {
  id: TutorialStepId;
  chapter: TutorialChapterId;
  order: number;
  title: string;
  description: string;
  objective: TutorialObjective;
  requirement: TutorialActionRequirement;
  target?: TutorialTarget;
  reward?: TutorialReward;
  advisor: TutorialAdvisorMessage;
  actionLabel?: string;
  nextRoute?: string;
  allowManualAdvance?: boolean;
  targetElementId?: string;
  advisorMessage?: string;
}

export interface TutorialProgress {
  currentStepId: TutorialStepId;
  completedStepIds: TutorialStepId[];
  isSkipped: boolean;
  isPaused: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  version: number;
}

export type TutorialState = TutorialProgress;

const TUTORIAL_STORAGE_KEY = "frontier_tutorial_state";
const TUTORIAL_VERSION = 2;

const nowIso = () => new Date().toISOString();

const target = (
  id: string,
  label: string,
  route?: string,
  placement: TutorialTarget["placement"] = "center",
): TutorialTarget => ({
  id,
  selector: `[data-tutorial-target="${id}"]`,
  route,
  label,
  placement,
});

function defineStep(step: Omit<TutorialStepDef, "advisorMessage" | "targetElementId">): TutorialStepDef {
  return {
    ...step,
    advisorMessage: step.advisor.text,
    targetElementId: step.target?.id,
  };
}

const stepDefs = [
  defineStep({
    id: "welcome",
    chapter: "city_economy",
    order: 1,
    title: "Başlangıç Buyruğu",
    description: "Bozkır Kağanlığı yeni otağını kurdu. İlk beş dakikada oba, ordu, yurt ve akın döngüsünü öğreneceksin.",
    objective: {
      title: "Divan rehberini başlat",
      instruction: "İlk emri onayla; rehber seni yalnızca gerçek hamleler tamamlandığında ilerletecek.",
      why: "Kısa bir sıra, oyunun ana döngüsünü metin duvarına çevirmeden öğretir.",
    },
    requirement: { type: "manual_ack" },
    advisor: {
      speaker: "kagan",
      text: "Kağan buyruğu açıktır: önce oba güçlenir, sonra bozkır konuşur.",
    },
    actionLabel: "İlk Emri Al",
    allowManualAdvance: true,
  }),
  defineStep({
    id: "resource_bar",
    chapter: "city_economy",
    order: 2,
    title: "Hazineyi Oku",
    description: "Odun, taş, erzak ve altın üst barın omurgasıdır. Her yapı, talim ve sefer bu dört kaynağa dayanır.",
    objective: {
      title: "Kaynak barını tanı",
      instruction: "Üstteki kaynak satırını incele; sayıların artışı ve eksilişi karar hızını belirler.",
      why: "Kaynak dengesini görmeden yükseltme ve talim emri vermek kör sefer açmak gibidir.",
    },
    requirement: { type: "manual_ack" },
    target: target("tutorial-target-resource-bar", "Kaynak barı", undefined, "bottom"),
    advisor: {
      speaker: "divan",
      text: "Divan defteri önce hazineyi sayar. Kaynağını bilmeyen bey, hudutta uzun duramaz.",
    },
    actionLabel: "Hazineyi Gördüm",
    allowManualAdvance: true,
  }),
  defineStep({
    id: "open_city",
    chapter: "city_economy",
    order: 3,
    title: "Başkent Otağı",
    description: "Şehir sayfası, yapı ve üretim kararlarının verildiği ilk ocaktır.",
    objective: {
      title: "Şehir sayfasını aç",
      instruction: "Başkent / Şehir ekranına git.",
      why: "Yeni bir kağanlık önce merkezini ayakta tutar; dış siyaset sonra gelir.",
    },
    requirement: { type: "visit_route", route: "/app/city" },
    target: target("tutorial-target-nav-city", "Şehir geçidi", "/app/city", "right"),
    advisor: {
      speaker: "divan",
      text: "Otağın kapısını aç. Yapı kuyruğu ve oba düzeni burada tutulur.",
    },
    actionLabel: "Başkent Aç",
    nextRoute: "/app/city",
  }),
  defineStep({
    id: "upgrade_townhall",
    chapter: "city_economy",
    order: 4,
    title: "Kağan Otağı Yükselt",
    description: "Kağan Otağı yeni yapı düzeninin sınırını belirler. İlk gerçek inşa buyruğunu burada ver.",
    objective: {
      title: "Town Hall yükseltmesini başlat",
      instruction: "Kağan Otağı / Town Hall kartındaki yükseltme butonunu kullan.",
      why: "Merkez güçlenmeden yeni üretim, savunma ve ordu düzeni dar kalır.",
    },
    requirement: { type: "upgrade_started", targetId: "TOWN_HALL" },
    target: target("tutorial-target-townhall-upgrade", "Kağan Otağı yükseltmesi", "/app/city", "left"),
    reward: {
      label: "Yapı kuyruğu açıldı",
      detail: "Artık şehir kararları zaman ve kaynak yönetimiyle okunur.",
    },
    advisor: {
      speaker: "kagan",
      text: "Kağan Otağı yükselmeden yeni töre kurulmaz. İlk buyruğun: başkentini güçlendir.",
    },
  }),
  defineStep({
    id: "open_army",
    chapter: "army_march",
    order: 5,
    title: "Talimgahı Aç",
    description: "Ordu ekranı, piyade ve diğer birliklerin sefere hazırlandığı yerdir.",
    objective: {
      title: "Ordu sayfasına geç",
      instruction: "Talimgah / Ordu ekranını aç.",
      why: "Yurtsuz ordu olmaz; ordusuz yurt korunmaz.",
    },
    requirement: { type: "visit_route", route: "/app/army" },
    target: target("tutorial-target-nav-army", "Talimgah geçidi", "/app/army", "right"),
    advisor: {
      speaker: "divan",
      text: "Otağ buyruğu verildi. Şimdi kılıç tutacak eri talim et.",
    },
    actionLabel: "Talimgaha Git",
    nextRoute: "/app/army",
  }),
  defineStep({
    id: "train_troops",
    chapter: "army_march",
    order: 6,
    title: "İlk Talim",
    description: "Az sayıda piyade bile keşif, baskı ve savunma kararlarını açar.",
    objective: {
      title: "Piyade talimini başlat",
      instruction: "Piyade satırındaki talim buyruğunu ver.",
      why: "Sefer haritasında her emir, arkada hazır birlik ister.",
    },
    requirement: { type: "training_started", targetId: "INFANTRY" },
    target: target("tutorial-target-barracks-train", "Piyade talim buyruğu", "/app/army", "left"),
    reward: {
      label: "Ordu kuyruğu başladı",
      detail: "Birlik stokları ve kuyruk süreleri artık sefer planını etkiler.",
    },
    advisor: {
      speaker: "divan",
      text: "İlk erler talime girsin. Bozkırda haber hızlı, kalkan hazır olmalı.",
    },
  }),
  defineStep({
    id: "open_map",
    chapter: "province_expansion",
    order: 7,
    title: "Sefer Haritası",
    description: "Dünya haritası; sis, yurt, devlet rengi, geçit ve akın kararlarını birlikte gösterir.",
    objective: {
      title: "Sefer Haritası'nı aç",
      instruction: "Harita ekranına geç.",
      why: "Şehir ve ordu hazırsa sıradaki karar, hangi yurdun önce okunacağıdır.",
    },
    requirement: { type: "visit_route", route: "/app/map" },
    target: target("tutorial-target-nav-map", "Sefer Haritası geçidi", "/app/map", "right"),
    advisor: {
      speaker: "kagan",
      text: "Atlar eyerlendi. Bozkırın rengini, hududunu ve zayıf geçidini oku.",
    },
    actionLabel: "Haritayı Aç",
    nextRoute: "/app/map",
  }),
  defineStep({
    id: "select_province",
    chapter: "province_expansion",
    order: 8,
    title: "Yurt Seç",
    description: "Boş bir siyasi yurt seçildiğinde Yurt Defteri açılır; risk, kaynak, ilişki ve etki oradan okunur.",
    objective: {
      title: "Düşük riskli bir yurt seç",
      instruction: "Haritada şehir/kamp olmayan yakın bir province karosuna tıkla.",
      why: "Rastgele akın yerine önce yurt bilgisini okumak diplomasi ve claim döngüsünü öğretir.",
    },
    requirement: { type: "province_selected" },
    target: target("tutorial-target-map-canvas", "Sefer haritası", "/app/map", "center"),
    advisor: {
      speaker: "divan",
      text: "Haritada yalnız kamp değil, yurt da konuşur. Yakındaki bir toprağı deftere al.",
    },
  }),
  defineStep({
    id: "scout_province",
    chapter: "province_expansion",
    order: 9,
    title: "Keşif Buyruğu",
    description: "Keşif, claim veya akın kararından önce yurdun direncini ve komşu baskısını anlamanı sağlar.",
    objective: {
      title: "Yurdu keşfe gönder",
      instruction: "Yurt Defteri'ndeki keşif veya gözetleme buyruğunu kullan.",
      why: "Bilgisiz claim diplomatik bedeli büyütür; keşif riski düşürür.",
    },
    requirement: { type: "province_scouted", action: "SCOUT" },
    target: target("tutorial-target-province-scout", "Yurt keşif buyruğu", "/app/map", "left"),
    advisor: {
      speaker: "divan",
      text: "Önce iz sür. Tozun nereden kalktığını bilmeden sancak dikilmez.",
    },
  }),
  defineStep({
    id: "claim_or_influence",
    chapter: "province_expansion",
    order: 10,
    title: "Sancak Zemini",
    description: "Etki kurmak veya claim hazırlamak, toprağı doğrudan savaşmadan siyasi döngüye alır.",
    objective: {
      title: "Etki veya claim hamlesi yap",
      instruction: "Yurt Defteri'nden etkin bir etki / claim / hudut buyruğu seç.",
      why: "Siyasi zemin, sonraki akın ve yönetim kararlarını daha okunur hale getirir.",
    },
    requirement: { type: "province_expansion_action" },
    target: target("tutorial-target-province-claim", "Etki ve claim buyrukları", "/app/map", "left"),
    advisor: {
      speaker: "kagan",
      text: "Kılıçtan önce sancak konuşsun. Hudut defterine ilk siyasi izini bırak.",
    },
  }),
  defineStep({
    id: "send_march",
    chapter: "province_expansion",
    order: 11,
    title: "İlk Sefer",
    description: "Bir hedefe scout, hasat veya akın buyruğu vermek dünya haritasındaki gerçek zamanlı march döngüsünü başlatır.",
    objective: {
      title: "Küçük bir sefer gönder",
      instruction: "Bir hedef veya saha buyruğu üzerinden composer'ı açıp seferi onayla.",
      why: "Sefer gönderilmeden rapor, ganimet ve kayıp döngüsü öğrenilemez.",
    },
    requirement: { type: "march_sent" },
    target: target("tutorial-target-composer-send", "Sefer onay buyruğu", "/app/map", "left"),
    advisor: {
      speaker: "divan",
      text: "Yol belli. Az birlikle dene; sonuç deftere düşecek.",
    },
  }),
  defineStep({
    id: "open_reports",
    chapter: "province_expansion",
    order: 12,
    title: "Akın Defteri",
    description: "Raporlar, keşif veya akın sonucunu okuyup sıradaki stratejik hamleyi seçtiğin defterdir.",
    objective: {
      title: "Rapor ekranını aç",
      instruction: "Akın Defteri'ne git.",
      why: "Sonuç okunmadan aynı hatayı tekrar etmek kolaydır.",
    },
    requirement: { type: "visit_route", route: "/app/reports" },
    target: target("tutorial-target-navigate-reports", "Akın Defteri geçidi", "/app/reports", "right"),
    advisor: {
      speaker: "divan",
      text: "Seferin sesi deftere düşer. Akın Defteri'ni aç ve sonucu oku.",
    },
    actionLabel: "Defteri Aç",
    nextRoute: "/app/reports",
  }),
  defineStep({
    id: "read_report",
    chapter: "province_expansion",
    order: 13,
    title: "Sonucu Oku",
    description: "Rapor kartı; kazanım, kayıp, hedef ve sonraki karar için kısa sonuç verir.",
    objective: {
      title: "Bir rapor kartını aç",
      instruction: "Listeden bir rapor seç.",
      why: "İyi kağan, her akından sonra deftere bakar; ganimet kadar kayıp da stratejidir.",
    },
    requirement: { type: "report_opened" },
    target: target("tutorial-target-report-card", "Rapor kartı", "/app/reports", "left"),
    advisor: {
      speaker: "divan",
      text: "Sonucu oku. Bir sonraki claim, keşif ya da talim buyruğu buradan doğar.",
    },
  }),
  defineStep({
    id: "completed",
    chapter: "complete",
    order: 14,
    title: "Buyruk Tamamlandı",
    description: "Artık ana döngüyü biliyorsun: oba kur, asker yetiştir, yurdu oku, etki kur, sefer gönder, raporla karar ver.",
    objective: {
      title: "Divan rehberi tamamlandı",
      instruction: "Harita, şehir ve defterleri bağımsız kullanmaya devam et.",
      why: "Bozkır Kağanlığı artık tek bir görev çizgisine değil, senin stratejine bağlı.",
    },
    requirement: { type: "complete" },
    advisor: {
      speaker: "kagan",
      text: "İlk buyruklar bitti. Şimdi töreyi sen yürüt.",
    },
    actionLabel: "Oyuna Dön",
    allowManualAdvance: true,
  }),
] satisfies TutorialStepDef[];

export const TUTORIAL_STEP_ORDER = stepDefs.map((step) => step.id);

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStepDef> = stepDefs.reduce(
  (acc, step) => {
    acc[step.id] = step;
    return acc;
  },
  {} as Record<TutorialStepId, TutorialStepDef>,
);

export const DEFAULT_TUTORIAL_STATE: TutorialState = createTutorialState();

export function getTutorialStorageKey() {
  return TUTORIAL_STORAGE_KEY;
}

export function createTutorialState(now = nowIso()): TutorialState {
  return {
    currentStepId: "welcome",
    completedStepIds: [],
    isSkipped: false,
    isPaused: false,
    startedAt: now,
    updatedAt: now,
    version: TUTORIAL_VERSION,
  };
}

function isStepId(value: unknown): value is TutorialStepId {
  return typeof value === "string" && value in TUTORIAL_STEPS;
}

function dedupeCompleted(ids: unknown): TutorialStepId[] {
  if (!Array.isArray(ids)) {
    return [];
  }
  const seen = new Set<TutorialStepId>();
  ids.forEach((id) => {
    if (isStepId(id) && id !== "completed") {
      seen.add(id);
    }
  });
  return TUTORIAL_STEP_ORDER.filter((id) => seen.has(id));
}

function migrateLegacyStep(stepId: unknown): TutorialStepId {
  if (stepId === "navigate_map") return "open_map";
  if (stepId === "select_target") return "select_province";
  if (isStepId(stepId)) return stepId;
  return "welcome";
}

export function normalizeTutorialState(candidate: unknown, now = nowIso()): TutorialState {
  if (!candidate || typeof candidate !== "object") {
    return createTutorialState(now);
  }

  const payload = candidate as Partial<TutorialState> & { currentStepId?: unknown; isSkipped?: unknown };
  const currentStepId = migrateLegacyStep(payload.currentStepId);
  const completedStepIds = dedupeCompleted(payload.completedStepIds);
  const isComplete = currentStepId === "completed";
  return {
    currentStepId,
    completedStepIds,
    isSkipped: payload.isSkipped === true,
    isPaused: payload.isPaused === true && !isComplete,
    startedAt: typeof payload.startedAt === "string" ? payload.startedAt : now,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : now,
    completedAt: typeof payload.completedAt === "string" ? payload.completedAt : isComplete ? now : undefined,
    version: TUTORIAL_VERSION,
  };
}

export function getSavedTutorialState(): TutorialState {
  if (typeof window === "undefined") return createTutorialState();
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (raw) {
      return normalizeTutorialState(JSON.parse(raw));
    }
  } catch {
    // Ignore malformed browser storage and restart the tutorial safely.
  }
  return createTutorialState();
}

export function saveTutorialState(state: TutorialState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(normalizeTutorialState(state)));
  } catch {
    // Browser storage can be unavailable in private mode; gameplay should continue.
  }
}

export function resetTutorialState(now = nowIso()): TutorialState {
  const state = createTutorialState(now);
  saveTutorialState(state);
  return state;
}

export function startTutorialState(now = nowIso()): TutorialState {
  return resetTutorialState(now);
}

export function skipTutorialState(state: TutorialState, now = nowIso()): TutorialState {
  return {
    ...normalizeTutorialState(state, now),
    isSkipped: true,
    isPaused: false,
    updatedAt: now,
  };
}

export function pauseTutorialState(state: TutorialState, now = nowIso()): TutorialState {
  const current = normalizeTutorialState(state, now);
  return {
    ...current,
    isPaused: current.currentStepId !== "completed",
    updatedAt: now,
  };
}

export function resumeTutorialState(state: TutorialState, now = nowIso()): TutorialState {
  return {
    ...normalizeTutorialState(state, now),
    isPaused: false,
    updatedAt: now,
  };
}

export function getTutorialStepIndex(stepId: TutorialStepId): number {
  return Math.max(0, TUTORIAL_STEP_ORDER.indexOf(stepId));
}

export function getCurrentTutorialStep(state: TutorialState): TutorialStepDef {
  return TUTORIAL_STEPS[normalizeTutorialState(state).currentStepId];
}

export function isTutorialComplete(state: TutorialState): boolean {
  return normalizeTutorialState(state).currentStepId === "completed";
}

export function isTutorialActive(state: TutorialState): boolean {
  const normalized = normalizeTutorialState(state);
  return !normalized.isSkipped && !normalized.isPaused && normalized.currentStepId !== "completed";
}

export function getTutorialProgressPercent(state: TutorialState): number {
  const normalized = normalizeTutorialState(state);
  if (normalized.currentStepId === "completed") {
    return 100;
  }
  const actionableSteps = TUTORIAL_STEP_ORDER.length - 1;
  return Math.round((normalized.completedStepIds.length / actionableSteps) * 100);
}

export function getTutorialHighlightTarget(state: TutorialState): TutorialTarget | undefined {
  if (!isTutorialActive(state)) {
    return undefined;
  }
  return getCurrentTutorialStep(state).target;
}

export function getTutorialAdvisorMessage(state: TutorialState): TutorialAdvisorMessage {
  return getCurrentTutorialStep(state).advisor;
}

export function shouldHighlightTutorialTarget(state: TutorialState | undefined, targetId: string): boolean {
  if (!state) {
    return false;
  }
  return getTutorialHighlightTarget(state)?.id === targetId;
}

function nextStepId(stepId: TutorialStepId): TutorialStepId {
  const index = getTutorialStepIndex(stepId);
  return TUTORIAL_STEP_ORDER[Math.min(TUTORIAL_STEP_ORDER.length - 1, index + 1)] ?? "completed";
}

export function completeTutorialStep(state: TutorialState, stepId: TutorialStepId, now = nowIso()): TutorialState {
  const current = normalizeTutorialState(state, now);
  if (current.isSkipped || current.currentStepId === "completed") {
    return current;
  }
  if (current.currentStepId !== stepId) {
    return current;
  }

  const completedStepIds = current.completedStepIds.includes(stepId)
    ? current.completedStepIds
    : [...current.completedStepIds, stepId];
  const currentStep = TUTORIAL_STEPS[stepId];
  const next = currentStep.requirement.type === "complete" ? "completed" : nextStepId(stepId);

  return {
    ...current,
    currentStepId: next,
    completedStepIds,
    isPaused: false,
    updatedAt: now,
    completedAt: next === "completed" ? now : current.completedAt,
  };
}

function routeMatches(expected: string | undefined, actual: string | undefined) {
  if (!expected || !actual) {
    return false;
  }
  return actual === expected || actual.startsWith(`${expected}/`);
}

export function completeTutorialRequirement(
  state: TutorialState,
  requirementType: TutorialRequirementType,
  meta: { route?: string; action?: string; targetId?: string } = {},
  now = nowIso(),
): TutorialState {
  const current = normalizeTutorialState(state, now);
  if (!isTutorialActive(current)) {
    return current;
  }

  const step = TUTORIAL_STEPS[current.currentStepId];
  if (step.requirement.type !== requirementType) {
    return current;
  }
  if (step.requirement.route && !routeMatches(step.requirement.route, meta.route)) {
    return current;
  }
  if (step.requirement.action && step.requirement.action !== meta.action) {
    return current;
  }
  if (step.requirement.targetId && meta.targetId && step.requirement.targetId !== meta.targetId) {
    return current;
  }

  return completeTutorialStep(current, step.id, now);
}
