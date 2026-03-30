import type { PublicBootstrapResponse } from "@frontier/shared";

import { env } from "./env";
import { HttpError } from "./http";

export function getPublicBootstrap(): PublicBootstrapResponse {
  return {
    launchPhase: env.LAUNCH_PHASE,
    registrationMode: env.REGISTRATION_MODE,
    storeEnabled: env.STORE_ENABLED,
  };
}

export function assertRegistrationAvailable(): void {
  if (env.REGISTRATION_MODE !== "open") {
    throw new HttpError(403, "REGISTRATION_CLOSED", "Registration is disabled for this launch phase.");
  }
}

export function assertStoreEnabled(): void {
  if (!env.STORE_ENABLED) {
    throw new HttpError(403, "FEATURE_DISABLED", "The imperial market is disabled for this launch phase.");
  }
}
