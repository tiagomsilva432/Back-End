import type { ServerResponse } from "node:http";
import type { User } from "../entities/User.js";

/**
 * Ligações Server-Sent Events abertas, por utilizador. Vive em memória: com
 * mais de um processo da API, cada um só conhecia as suas (ver README).
 *
 * O stream só leva o que acontece enquanto a pessoa está ligada. As
 * notificações ficam gravadas antes de passarem por aqui, por isso quem está
 * offline não perde nada: lê-as pela API REST quando voltar.
 */

export type CloseReason = "token_expired" | "account_inactive" | "server_shutdown" | "too_many_connections";

/** O que o hub usa da resposta. Um Response do Express serve; nos testes, um falso. */
export type StreamResponse = Pick<
    ServerResponse,
    "writeHead" | "flushHeaders" | "write" | "end" | "on" | "writableEnded" | "destroyed"
>;

interface Connection {
    userId: string;
    companyId: string;
    res: StreamResponse;
    heartbeat: NodeJS.Timeout;
    expiry: NodeJS.Timeout;
}

/** Abaixo dos ~30-60s em que proxies e browsers dão uma ligação parada por morta. */
const HEARTBEAT_MS = 25_000;
/** Acima disto o setTimeout dispara logo, e um JWT longo fechava tudo à nascença. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** Cada separador abre a sua. Acima disto, a mais antiga fecha. */
const MAX_CONNECTIONS_PER_USER = 5;

const connections = new Map<string, Set<Connection>>();

/** JSON.stringify nunca deixa uma quebra de linha crua, por isso uma linha `data:` chega. */
const frame = (event: string, data: unknown): string =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// Escrever numa resposta já fechada emite 'error', e um 'error' sem ouvinte
// deitava o processo abaixo.
function write(connection: Connection, chunk: string): void {
    if (connection.res.writableEnded || connection.res.destroyed) {
        return;
    }
    connection.res.write(chunk);
}

function remove(connection: Connection): void {
    clearInterval(connection.heartbeat);
    clearTimeout(connection.expiry);

    const own = connections.get(connection.userId);
    own?.delete(connection);
    if (own?.size === 0) {
        connections.delete(connection.userId);
    }
}

/** Diz ao cliente porquê, antes de fechar: só assim sabe se vale a pena voltar a ligar. */
function close(connection: Connection, reason: CloseReason): void {
    write(connection, frame("close", { reason }));
    if (!connection.res.writableEnded) {
        connection.res.end();
    }
    remove(connection);
}

function* allConnections(): Generator<Connection> {
    for (const own of connections.values()) {
        yield* own;
    }
}

/**
 * Transforma a resposta num stream e regista-a. Fecha sozinho quando o JWT que
 * autorizou a ligação expira: a ligação nunca dura mais do que o token.
 */
function attach(
    res: StreamResponse,
    user: Pick<User, "id" | "companyId">,
    expiresAtMs: number,
    ready: unknown,
): void {
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Sem isto, um nginx à frente guardava os eventos em buffer.
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const connection: Connection = {
        userId: user.id,
        companyId: user.companyId,
        res,
        heartbeat: setInterval(() => write(connection, ": ping\n\n"), HEARTBEAT_MS).unref(),
        expiry: setTimeout(
            () => close(connection, "token_expired"),
            Math.min(Math.max(expiresAtMs - Date.now(), 0), MAX_TIMEOUT_MS),
        ).unref(),
    };

    // 'close' da resposta, e não do pedido: num GET o pedido fecha logo que é lido.
    res.on("close", () => remove(connection));
    res.on("error", () => remove(connection));

    const own = connections.get(user.id) ?? new Set<Connection>();
    connections.set(user.id, own);
    own.add(connection);

    // Um Set guarda a ordem de entrada: a primeira é a mais antiga. Com a razão,
    // o cliente sabe que não deve voltar a ligar, senão tirava o lugar a outra.
    if (own.size > MAX_CONNECTIONS_PER_USER) {
        const [oldest] = own;
        if (oldest) {
            close(oldest, "too_many_connections");
        }
    }

    write(connection, frame("ready", ready));
}

/** Aceita nulls e repetidos, para quem chama poder juntar listas sem as limpar. */
function sendToUsers(userIds: Iterable<string | null | undefined>, event: string, data: unknown): void {
    const chunk = frame(event, data);

    for (const userId of new Set(userIds)) {
        for (const connection of (userId && connections.get(userId)) || []) {
            write(connection, chunk);
        }
    }
}

function sendToCompany(companyId: string, event: string, data: unknown): void {
    const chunk = frame(event, data);

    for (const connection of allConnections()) {
        if (connection.companyId === companyId) {
            write(connection, chunk);
        }
    }
}

function broadcast(event: string, data: unknown): void {
    const chunk = frame(event, data);

    for (const connection of allConnections()) {
        write(connection, chunk);
    }
}

function disconnectUser(userId: string, reason: CloseReason): void {
    for (const connection of [...(connections.get(userId) ?? [])]) {
        close(connection, reason);
    }
}

function closeAll(reason: CloseReason = "server_shutdown"): void {
    for (const connection of [...allConnections()]) {
        close(connection, reason);
    }
}

/** Para os testes e para diagnóstico. Sem userId, conta todas. */
function connectionCount(userId?: string): number {
    if (userId) {
        return connections.get(userId)?.size ?? 0;
    }
    return [...allConnections()].length;
}

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const realtime = {
    attach,
    sendToUsers,
    sendToCompany,
    broadcast,
    disconnectUser,
    closeAll,
    connectionCount,
};
