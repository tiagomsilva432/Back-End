import { randomBytes } from "node:crypto";
import type { JwtPayload } from "../dtos/auth/jwt-dto.js";

/**
 * Bilhetes para abrir o stream de notificações. O EventSource do browser não
 * manda o header Authorization, e um JWT no URL ficava nos logs e servia
 * durante horas. Um bilhete serve uma vez, durante 30 segundos.
 *
 * Em memória, como as ligações: só serve com um processo da API.
 */

const TICKET_TTL_MS = 30_000;

interface Entry {
    auth: JwtPayload;
    expiresAt: number;
}

const tickets = new Map<string, Entry>();

/** Sem timer: os expirados limpam-se sempre que se emite outro. */
function sweep(now: number): void {
    for (const [ticket, entry] of tickets) {
        if (entry.expiresAt <= now) {
            tickets.delete(ticket);
        }
    }
}

function issue(auth: JwtPayload): { ticket: string; expiresInSeconds: number } {
    const now = Date.now();
    sweep(now);

    const ticket = randomBytes(32).toString("base64url");
    // Nunca dura mais do que o token que o pediu.
    tickets.set(ticket, { auth, expiresAt: Math.min(now + TICKET_TTL_MS, auth.exp * 1000) });

    return { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 };
}

/** Gasta o bilhete: um segundo uso, ou um bilhete expirado, devolve null. */
function consume(ticket: string): JwtPayload | null {
    const entry = tickets.get(ticket);
    tickets.delete(ticket);

    if (!entry || entry.expiresAt <= Date.now()) {
        return null;
    }

    return entry.auth;
}

function clear(): void {
    tickets.clear();
}

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const streamTickets = { issue, consume, clear };
