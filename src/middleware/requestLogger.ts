import type { Request, Response, NextFunction } from "express";

/** O bilhete do stream é de uso único, mas não tem nada que fazer nos logs. */
const redact = (url: string): string => url.replace(/([?&]ticket=)[^&]*/gi, "$1[oculto]");

export function requestLogger(req: Request,res: Response,next: NextFunction): void {
  const start = Date.now();
  let logged = false;

  // Um stream que o cliente fecha nunca emite 'finish', só 'close'.
  const log = () => {
    if (logged) return;
    logged = true;
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${redact(req.originalUrl)} → ${res.statusCode} (${ms}ms)`
    );
  };

  res.on("finish", log);
  res.on("close", log);
  next();
}

