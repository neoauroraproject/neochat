import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error", error: "InternalServerError" };

    const message =
      typeof body === "string"
        ? body
        : typeof body === "object" && body !== null && "message" in body
          ? (body as { message: string | string[] }).message
          : "Unexpected error";

    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code?: string }).code)
        : undefined;

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId: request.id, path: request.url },
        "Unhandled exception",
      );
    }

    response.status(status).json({
      statusCode: status,
      error:
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: string }).error)
          : (HttpStatus[status] ?? "Error"),
      message,
      ...(code ? { code } : {}),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
