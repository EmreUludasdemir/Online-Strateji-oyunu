/**
 * OpenTelemetry SDK initialization.
 * MUST be imported before any other modules to ensure proper instrumentation.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

// Parse OTEL config from environment (before env.ts is loaded)
const otelEnabled = process.env.OTEL_ENABLED === "true";
const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const serviceName = process.env.OTEL_SERVICE_NAME || "frontier-server";
const nodeEnv = process.env.NODE_ENV || "development";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK.
 * Should be called at the very start of the application.
 */
export function initTelemetry(): void {
  if (!otelEnabled) {
    console.log("[telemetry] OpenTelemetry disabled (OTEL_ENABLED != true)");
    return;
  }

  console.log(`[telemetry] Initializing OpenTelemetry...`);
  console.log(`[telemetry] Service: ${serviceName}, Endpoint: ${otelEndpoint}`);

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "0.0.1",
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: nodeEnv,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${otelEndpoint}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy)
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Configure HTTP instrumentation
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => {
            // Ignore health check endpoints
            const url = req.url || "";
            return url.includes("/health") || url === "/metrics";
          },
        },
        // Configure Pino instrumentation for log correlation
        "@opentelemetry/instrumentation-pino": {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();
  console.log("[telemetry] OpenTelemetry SDK started");
}

/**
 * Gracefully shutdown the OpenTelemetry SDK.
 * Should be called during application shutdown.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  console.log("[telemetry] Shutting down OpenTelemetry SDK...");
  try {
    await sdk.shutdown();
    console.log("[telemetry] OpenTelemetry SDK shutdown complete");
  } catch (error) {
    console.error("[telemetry] Error shutting down OpenTelemetry SDK:", error);
  }
}

/**
 * Check if OpenTelemetry is enabled.
 */
export function isTelemetryEnabled(): boolean {
  return otelEnabled;
}
