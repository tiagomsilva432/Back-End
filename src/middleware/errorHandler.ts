import { Request, Response, NextFunction } from "express";
import { HttpError } from "../dtos/common/errors.dto.js";
import { HttpResponse } from "../dtos/common/responses.dto.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV === "development";
  if (err instanceof HttpError) {
    new HttpResponse(
      err.status,
      err.message,
      err.code,
      isDev ? err.details : undefined
    ).send(res);
    return;
  }

  console.error("[Unhandled Error]", err);

  new HttpResponse(
    500,
    undefined,
    undefined,
    isDev ? (err instanceof Error ? err.message : String(err)) : undefined
  ).send(res);
}