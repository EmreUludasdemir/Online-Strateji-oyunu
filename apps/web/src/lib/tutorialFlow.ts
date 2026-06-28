export type TutorialStepId =
  | "welcome"
  | "upgrade_townhall"
  | "train_troops"
  | "navigate_map"
  | "select_target"
  | "send_march"
  | "read_report"
  | "completed";

export interface TutorialStepDef {
  id: TutorialStepId;
  title: string;
  description: string;
  actionLabel?: string;
  targetElementId?: string; // e.g., "town_hall_card", "barracks_train_btn"
  nextRoute?: string;
  advisorMessage?: string;
}

export const TUTORIAL_STEPS: Record<TutorialStepId, TutorialStepDef> = {
  welcome: {
    id: "welcome",
    title: "Bozkıra Hoş Geldiniz",
    description: "Kağanım, obamıza ulaştınız. Yukarıdaki kaynak barından erzak ve altınınızı takip edebilirsiniz. Önce şehrin merkezini büyütmeliyiz.",
    actionLabel: "Emredersin",
    advisorMessage: "Kağanım, obamızı büyütmek için Otağı yükseltmelisiniz.",
  },
  upgrade_townhall: {
    id: "upgrade_townhall",
    title: "Otağı Yükselt",
    description: "Otağ (Town Hall), diğer binaların seviye sınırını belirler. Şimdi Otağı 2. seviyeye yükseltin.",
    targetElementId: "tutorial-target-townhall-upgrade",
    advisorMessage: "Otağı yükseltmek için inşaat butonuna tıklayın.",
  },
  train_troops: {
    id: "train_troops",
    title: "Asker Eğit",
    description: "Güçlü bir ordu olmadan hayatta kalamayız. Kışla üzerinden biraz asker eğitin.",
    targetElementId: "tutorial-target-barracks-train",
    advisorMessage: "Kışla'ya gidin ve piyade eğitme emri verin.",
  },
  navigate_map: {
    id: "navigate_map",
    title: "Dünyayı Keşfet",
    description: "Ordumuz hazır. Şimdi Bozkır'a (Haritaya) açılarak etrafımızdaki tehlikeleri ve ganimetleri görelim.",
    targetElementId: "tutorial-target-nav-map",
    nextRoute: "/app/map",
    advisorMessage: "Dünya haritasını açıp çevremizi kolaçan edelim.",
  },
  select_target: {
    id: "select_target",
    title: "Hedef Seç",
    description: "Haritada bir Barbar Kampı veya Bereket Kaynağı bularak üzerine tıklayın.",
    advisorMessage: "Haritada düşük riskli bir Barbar Kampı bulun.",
  },
  send_march: {
    id: "send_march",
    title: "Ordu Gönder",
    description: "Hedef için bir komutan ve birlik seçin, ardından buyruğu vererek sefere çıkın.",
    targetElementId: "tutorial-target-composer-send",
    advisorMessage: "Komutanınızı seçin, askeri birliği ayarlayın ve akın emrini verin.",
  },
  read_report: {
    id: "read_report",
    title: "Raporları İncele",
    description: "Akın tamamlandı. Savaş Divanına giderek raporu okuyun ve ordunuzun performansını analiz edin.",
    targetElementId: "tutorial-target-navigate-reports",
    nextRoute: "/app/reports",
    advisorMessage: "Akın sonuçlandı Kağanım! Raporları kontrol edelim.",
  },
  completed: {
    id: "completed",
    title: "Eğitim Tamamlandı",
    description: "Artık başkentinizi büyütmeye ve bozkıra hükmetmeye hazırsınız. Yolunuz açık olsun Kağanım!",
    actionLabel: "Oyuna Başla",
    advisorMessage: "Artık tüm kararlar size ait Kağanım.",
  },
};

const TUTORIAL_STORAGE_KEY = "frontier_tutorial_state";

export interface TutorialState {
  currentStepId: TutorialStepId;
  isSkipped: boolean;
}

const DEFAULT_STATE: TutorialState = {
  currentStepId: "welcome",
  isSkipped: false,
};

export function getSavedTutorialState(): TutorialState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as TutorialState;
    }
  } catch {
    // ignore
  }
  return DEFAULT_STATE;
}

export function saveTutorialState(state: TutorialState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
