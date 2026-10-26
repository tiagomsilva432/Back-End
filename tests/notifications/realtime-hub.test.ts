import { describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { realtime, type StreamResponse } from "../../src/services/realtime.js";

/** O mínimo de uma resposta HTTP que o hub usa, a guardar o que lhe escrevem. */
class FakeResponse extends EventEmitter {
    chunks: string[] = [];
    status: number | null = null;
    headers: Record<string, string> = {};
    writableEnded = false;
    destroyed = false;

    writeHead(status: number, headers: Record<string, string>) {
        this.status = status;
        this.headers = headers;
        return this;
    }

    flushHeaders() {}

    write(chunk: string) {
        this.chunks.push(chunk);
        return true;
    }

    end() {
        this.writableEnded = true;
        this.emit("close");
        return this;
    }

    /** Os eventos recebidos, já separados em nome e dados. */
    events(): Array<{ event: string; data: unknown }> {
        return this.chunks
            .filter((chunk) => chunk.startsWith("event: "))
            .map((chunk) => {
                const [eventLine, dataLine] = chunk.trim().split("\n") as [string, string];
                return { event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) };
            });
    }
}

const NA_PROXIMA_HORA = () => Date.now() + 60 * 60 * 1000;

let seq = 0;
const pessoa = (companyId = "empresa-a") => ({ id: `pessoa-${++seq}`, companyId });

const ligar = (user: { id: string; companyId: string }, expiresAtMs = NA_PROXIMA_HORA()) => {
    const res = new FakeResponse();
    realtime.attach(res as unknown as StreamResponse, user, expiresAtMs, { unread: 3 });
    return res;
};

/** Os eventos depois do ready. */
const recebidos = (res: FakeResponse) => res.events().slice(1);

describe("realtime.attach", () => {
    it("abre o stream com os headers de SSE e manda logo o ready", () => {
        const res = ligar(pessoa());

        expect(res.status).toBe(200);
        expect(res.headers).toMatchObject({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        });
        expect(res.events()).toEqual([{ event: "ready", data: { unread: 3 } }]);
    });

    it("quando o cliente sai, a ligação deixa de contar", () => {
        const ana = pessoa();
        const res = ligar(ana);

        res.emit("close");

        expect(realtime.connectionCount(ana.id)).toBe(0);
    });

    it("fecha com token_expired quando o JWT expira", async () => {
        const ana = pessoa();
        const res = ligar(ana, Date.now() - 1);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(recebidos(res)).toEqual([{ event: "close", data: { reason: "token_expired" } }]);
        expect(res.writableEnded).toBe(true);
        expect(realtime.connectionCount(ana.id)).toBe(0);
    });

    it("um JWT muito longo não fecha a ligação logo à nascença", async () => {
        const ana = pessoa();
        const res = ligar(ana, Date.now() + 365 * 24 * 60 * 60 * 1000);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(res.writableEnded).toBe(false);
        expect(realtime.connectionCount(ana.id)).toBe(1);
    });

    it("manda um ping de 25 em 25 segundos", () => {
        jest.useFakeTimers();
        try {
            const res = ligar(pessoa());

            jest.advanceTimersByTime(25_000);

            expect(res.chunks.at(-1)).toBe(": ping\n\n");
        } finally {
            realtime.closeAll();
            jest.useRealTimers();
        }
    });

    it("acima de 5 ligações da mesma pessoa, fecha a mais antiga", () => {
        const ana = pessoa();
        const ligacoes = Array.from({ length: 6 }, () => ligar(ana));

        expect(realtime.connectionCount(ana.id)).toBe(5);
        expect(recebidos(ligacoes[0]!)).toEqual([{ event: "close", data: { reason: "too_many_connections" } }]);
        expect(ligacoes[0]!.writableEnded).toBe(true);
        expect(ligacoes.slice(1).every((res) => !res.writableEnded)).toBe(true);
    });
});

describe("realtime.sendToUsers / sendToCompany / broadcast", () => {
    it("sendToUsers chega a todas as ligações dessas pessoas e a mais ninguém", () => {
        const ana = pessoa();
        const rui = pessoa();
        const [separador1, separador2] = [ligar(ana), ligar(ana)];
        const doRui = ligar(rui);

        realtime.sendToUsers([ana.id, ana.id, null, undefined], "notification", { id: 1 });

        expect(recebidos(separador1!)).toEqual([{ event: "notification", data: { id: 1 } }]);
        expect(recebidos(separador2!)).toEqual([{ event: "notification", data: { id: 1 } }]);
        expect(recebidos(doRui)).toEqual([]);
    });

    it("sendToCompany só chega a quem é dessa empresa; broadcast chega a toda a gente", () => {
        const daA = ligar(pessoa("empresa-a"));
        const daB = ligar(pessoa("empresa-b"));

        realtime.sendToCompany("empresa-a", "announcement", { action: "created" });
        realtime.broadcast("announcement", { action: "deleted" });

        expect(recebidos(daA).map((e) => e.data)).toEqual([{ action: "created" }, { action: "deleted" }]);
        expect(recebidos(daB).map((e) => e.data)).toEqual([{ action: "deleted" }]);
    });

    it("não escreve numa resposta já fechada", () => {
        const ana = pessoa();
        const res = ligar(ana);
        res.destroyed = true;

        expect(() => realtime.sendToUsers([ana.id], "notification", {})).not.toThrow();
        expect(recebidos(res)).toEqual([]);
    });
});

describe("realtime.disconnectUser / closeAll", () => {
    it("disconnectUser diz porquê e fecha todas as ligações dessa pessoa", () => {
        const ana = pessoa();
        const rui = pessoa();
        const daAna = ligar(ana);
        const doRui = ligar(rui);

        realtime.disconnectUser(ana.id, "account_inactive");

        expect(recebidos(daAna)).toEqual([{ event: "close", data: { reason: "account_inactive" } }]);
        expect(daAna.writableEnded).toBe(true);
        expect(doRui.writableEnded).toBe(false);
        expect(realtime.connectionCount(ana.id)).toBe(0);
    });

    it("closeAll fecha tudo com server_shutdown", () => {
        const ligacoes = [ligar(pessoa()), ligar(pessoa("empresa-b"))];

        realtime.closeAll();

        expect(realtime.connectionCount()).toBe(0);
        for (const res of ligacoes) {
            expect(recebidos(res)).toEqual([{ event: "close", data: { reason: "server_shutdown" } }]);
        }
    });
});
