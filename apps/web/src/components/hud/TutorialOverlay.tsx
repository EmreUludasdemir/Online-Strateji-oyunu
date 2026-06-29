import { useNavigate } from "react-router-dom";

import {
  getCurrentTutorialStep,
  getTutorialProgressPercent,
  getTutorialStepIndex,
  isTutorialComplete,
  TUTORIAL_STEP_ORDER,
} from "../../lib/tutorialFlow";
import type { TutorialState, TutorialStepId } from "../../lib/tutorialFlow";
import { Button } from "../ui/Button";
import styles from "./TutorialOverlay.module.css";

const chapterLabels: Record<string, string> = {
  city_economy: "Bölüm I · Oba ve Hazine",
  army_march: "Bölüm II · Ordu ve Sefer",
  province_expansion: "Bölüm III · Yurt ve Hudut",
  complete: "Divan Defteri",
};

export interface TutorialOverlayProps {
  tutorialState: TutorialState;
  completeTutorialStep: (stepId: TutorialStepId) => void;
  pauseTutorial: () => void;
  resumeTutorial: () => void;
  resetTutorial: () => void;
  skipTutorial: () => void;
}

export function TutorialOverlay({
  tutorialState,
  completeTutorialStep,
  pauseTutorial,
  resumeTutorial,
  resetTutorial,
  skipTutorial,
}: TutorialOverlayProps) {
  const navigate = useNavigate();

  if (tutorialState.isSkipped || isTutorialComplete(tutorialState)) {
    return null;
  }

  const currentStep = getCurrentTutorialStep(tutorialState);
  const progressPercent = getTutorialProgressPercent(tutorialState);
  const currentIndex = getTutorialStepIndex(currentStep.id) + 1;
  const totalSteps = TUTORIAL_STEP_ORDER.length - 1;
  const isManualStep = currentStep.allowManualAdvance || currentStep.requirement.type === "manual_ack";
  const destinationRoute = currentStep.nextRoute ?? currentStep.target?.route;
  const primaryLabel = currentStep.actionLabel ?? (destinationRoute ? "Odağa Git" : "Buyruğu Uygula");

  const handlePrimaryAction = () => {
    if (destinationRoute) {
      navigate(destinationRoute);
    }
    if (isManualStep) {
      completeTutorialStep(currentStep.id);
    }
  };

  if (tutorialState.isPaused) {
    return (
      <aside className={styles.overlayContainer} data-tutorial-advisor="paused" aria-live="polite">
        <div className={styles.briefingPanel}>
          <div className={styles.briefingHeader}>
            <span className={styles.eyebrow}>Divan Rehberi</span>
            <button className={styles.linkButton} type="button" onClick={skipTutorial}>
              Atla
            </button>
          </div>
          <strong className={styles.title}>Rehber durakladı</strong>
          <p className={styles.description}>
            Kağan buyruğu saklandı. Hazır olduğunda aynı adımdan devam edebilirsin.
          </p>
          <div className={styles.actionRow}>
            <Button type="button" variant="secondary" size="small" onClick={resetTutorial}>
              Sıfırla
            </Button>
            <Button type="button" variant="primary" size="small" onClick={resumeTutorial}>
              Sürdür
            </Button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={styles.overlayContainer}
      data-tutorial-advisor="active"
      aria-live="polite"
      aria-label="Divan tutorial guidance"
    >
      <div className={styles.briefingPanel}>
        <div className={styles.briefingHeader}>
          <div>
            <span className={styles.eyebrow}>Kağan Brifingi</span>
            <span className={styles.chapter}>{chapterLabels[currentStep.chapter]}</span>
          </div>
          <span className={styles.progressText}>
            {Math.min(currentIndex, totalSteps)}/{totalSteps}
          </span>
        </div>

        <span className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
        </span>

        <strong className={styles.title}>{currentStep.objective.title}</strong>
        <p className={styles.description}>{currentStep.objective.instruction}</p>

        <div className={styles.advisorBox}>
          <span>{currentStep.advisor.speaker === "kagan" ? "Kağan" : "Divan"}</span>
          <p>{currentStep.advisor.text}</p>
        </div>

        <p className={styles.whyText}>{currentStep.objective.why}</p>

        {currentStep.target ? (
          <p className={styles.targetLine}>
            Odak: <strong>{currentStep.target.label}</strong>
          </p>
        ) : null}

        <div className={styles.actionRow}>
          <button className={styles.linkButton} type="button" onClick={pauseTutorial}>
            Duraklat
          </button>
          <button className={styles.linkButton} type="button" onClick={skipTutorial}>
            Atla
          </button>
          <Button type="button" variant="primary" size="small" onClick={handlePrimaryAction}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </aside>
  );
}
