import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { envIsDev } from "../env-vars.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Um stream já mandou os headers: não há envelope JSON que ainda caiba.
  if (res.headersSent) {
    console.error("[Error after headers sent]", err);
    res.end();
    return;
  }

  if (err instanceof HttpError) {
    // Os details de um 4xx são erros de campo; os de um 5xx são internos.
    const exposeDetails = err.status < 500 || envIsDev();

    new HttpResponse(
      err.status,
      err.message,
      err.code,
      exposeDetails ? err.details : undefined
    ).send(res);
    return;
  }

  console.error("[Unhandled Error]", err);

  new HttpResponse(
    500,
    undefined,
    undefined,
    envIsDev() ? (err instanceof Error ? err.message : String(err)) : undefined
  ).send(res);
}