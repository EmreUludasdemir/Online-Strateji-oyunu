import { useNavigate } from "react-router-dom";
import { TUTORIAL_STEPS } from "../../lib/tutorialFlow";
import type { TutorialState, TutorialStepId } from "../../lib/tutorialFlow";
import { Button } from "../ui/Button";
import styles from "./TutorialOverlay.module.css";

export interface TutorialOverlayProps {
  tutorialState: TutorialState;
  completeTutorialStep: (stepId: TutorialStepId) => void;
  skipTutorial: () => void;
}

export function TutorialOverlay({ tutorialState, completeTutorialStep, skipTutorial }: TutorialOverlayProps) {
  const navigate = useNavigate();

  if (tutorialState.isSkipped || tutorialState.currentStepId === "completed") {
    return null;
  }

  const currentStep = TUTORIAL_STEPS[tutorialState.currentStepId];

  const handleNext = () => {
    if (currentStep.nextRoute) {
      navigate(currentStep.nextRoute);
    }
    completeTutorialStep(currentStep.id);
  };

  return (
    <div className={styles.overlayContainer}>
      <div className={styles.briefingPanel}>
        <div className={styles.briefingHeader}>
          <span className={styles.eyebrow}>Divan Brifingi</span>
          <button className={styles.skipButton} onClick={skipTutorial}>Atla</button>
        </div>
        <strong className={styles.title}>{currentStep.title}</strong>
        <p className={styles.description}>{currentStep.description}</p>
        
        {currentStep.actionLabel ? (
          <div className={styles.actionRow}>
            <Button type="button" variant="primary" onClick={handleNext}>
              {currentStep.actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
