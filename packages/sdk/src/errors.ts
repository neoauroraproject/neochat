import type { ErrorResponse } from "@neochat/shared";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly error: string;
  readonly code?: string;

  constructor(body: ErrorResponse) {
    const message = typeof body.message === "string" ? body.message : body.message.join("; ");
    super(message);
    this.name = "ApiError";
    this.statusCode = body.statusCode;
    this.error = body.error;
    this.code = body.code;
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Network request failed");
    this.name = "NetworkError";
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}
