import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { streamTickets } from "../services/stream-tickets.js";
import { requireAuth } from "./requireAuth.js";

/**
 * O requireAuth do stream. O EventSource do browser não manda headers, por
 * isso aceita um bilhete de uso único em `?ticket=`; sem bilhete, exige o
 * Bearer como as outras rotas (clientes com fetch, e os testes).
 *
 * Deixa o req.auth como o requireAuth deixaria, por isso o requireRole() a
 * seguir confirma a conta na base de dados como em qualquer outra rota.
 */
export function requireStreamAuth(req: Request, res: Response, next: NextFunction) {
    const { ticket } = req.query;

    if (ticket === undefined) {
        return requireAuth(req, res, next);
    }

    const auth = typeof ticket === "string" ? streamTickets.consume(ticket) : null;

    if (!auth) {
        return next(new HttpError(401, "Bilhete inválido ou expirado"));
    }

    req.auth = auth;
    next();
}
