import type { Request, Response, NextFunction } from "express";
import { QueryFailedError } from "typeorm";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { envIsDev } from "../env-vars.js";

/** Os do express.json(): corpo que não é JSON, grande de mais, charset desconhecido. */
const isBodyParserError = (err: unknown): err is { status: number; type: string } => {
  const candidate = err as { status?: unknown; type?: unknown; expose?: unknown } | null;
  return typeof candidate?.type === "string"
    && candidate.expose === true
    && typeof candidate.status === "number"
    && candidate.status >= 400
    && candidate.status < 500;
};

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

  if (isBodyParserError(err)) {
    new HttpResponse(err.status, err.type === "entity.parse.failed" ? "O pedido não é JSON válido" : undefined).send(res);
    return;
  }

  // Dois pedidos passaram juntos pela verificação: o índice único travou o segundo.
  if (err instanceof QueryFailedError && (err.driverError as { code?: string } | undefined)?.code === "23505") {
    new HttpResponse(409, "Já existe um registo igual").send(res);
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