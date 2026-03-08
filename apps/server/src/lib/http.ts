import { ZodSchema } from "zod";

import type { ApiError } from "@frontier/shared";

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: string[];

  constructor(statusCode: number, code: string, message: string, details?: string[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function parseOrThrow<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The request payload is invalid.",
      result.error.issues.map((issue) => issue.message),
    );
  }

  return result.data;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred.",
  };
}
