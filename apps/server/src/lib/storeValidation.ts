export type StorePlatform = "APPLE_APP_STORE" | "GOOGLE_PLAY";

export interface StoreValidationRequest {
  platform: StorePlatform;
  productId: string;
  purchaseToken: string;
  userId: string;
}

export interface StoreValidationResult {
  ok: boolean;
  status: "NOT_CONFIGURED" | "VALID";
}

export interface StoreValidationPort {
  readonly mode: "noop";
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

export const storeValidationPort: StoreValidationPort = new NoopStoreValidationPort();
