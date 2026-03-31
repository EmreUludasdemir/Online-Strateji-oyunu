/**
 * Tracing utilities for manual instrumentation.
 * Provides helper functions for creating custom spans in application code.
 */
import { trace, context, SpanStatusCode, Span, SpanKind, Context } from "@opentelemetry/api";

const tracer = trace.getTracer("frontier-server");

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Execute a function within a new span.
 * Automatically records errors and sets span status.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options: SpanOptions = {}
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    {
      kind: options.kind ?? SpanKind.INTERNAL,
      attributes: options.attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Execute a synchronous function within a new span.
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options: SpanOptions = {}
): T {
  const span = tracer.startSpan(name, {
    kind: options.kind ?? SpanKind.INTERNAL,
    attributes: options.attributes,
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for game engine operations.
 */
export async function traceGameOperation<T>(
  operation: string,
  fn: (span: Span) => Promise<T>,
  attributes: Record<string, string | number | boolean> = {}
): Promise<T> {
  return withSpan(`game.${operation}`, fn, {
    attributes: {
      "game.operation": operation,
      ...attributes,
    },
  });
}

/**
 * Create a span for WebSocket operations.
 */
export async function traceWebSocketOperation<T>(
  operation: string,
  userId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`ws.${operation}`, fn, {
    kind: SpanKind.SERVER,
    attributes: {
      "ws.operation": operation,
      "user.id": userId,
    },
  });
}

/**
 * Get the current active span (if any).
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Add attributes to the current active span.
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an event on the current active span.
 */
export function recordSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Get tracer for custom instrumentation.
 */
export function getTracer() {
  return tracer;
}
