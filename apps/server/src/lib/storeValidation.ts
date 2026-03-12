export type StorePlatform = "APPLE_APP_STORE" | "GOOGLE_PLAY";

export interface StoreValidationRequest {
  platform: StorePlatform;
  productId: string;
  purchaseToken: string;
  userId: string;
}

export interface StoreValidationResult {
  ok: boolean;
  status: "NOT_CONFIGURED" | "VALID" | "INVALID";
}

export interface StoreValidationPort {
  readonly mode: "noop" | "sandbox";
  validatePurchase(request: StoreValidationRequest): Promise<StoreValidationResult>;
}

class NoopStoreValidationPort implements StoreValidationPort {
  readonly mode = "noop" as const;

  async validatePurchase(_request: StoreValidationRequest): Promise<StoreValidationResult> {
    return {
      ok: false,
      status: "NOT_CONFIGURED",
    };
  }
}

class SandboxStoreValidationPort implements StoreValidationPort {
  readonly mode = "sandbox" as const;

  async validatePurchase(request: StoreValidationRequest): Promise<StoreValidationResult> {
    const expectedPrefix = `sandbox:${request.productId}:`;
    return {
      ok: request.purchaseToken.startsWith(expectedPrefix),
      status: request.purchaseToken.startsWith(expectedPrefix) ? "VALID" : "INVALID",
    };
  }
}

export const storeValidationPort: StoreValidationPort =
  process.env.STORE_VALIDATION_MODE === "sandbox" ? new SandboxStoreValidationPort() : new NoopStoreValidationPort();
