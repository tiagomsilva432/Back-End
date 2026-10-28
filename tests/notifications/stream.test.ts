import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { streamTickets } from "../../src/services/stream-tickets.js";
import { AnnouncementScope, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { logSpy } from "../helpers/console-spy.js";
import { criarNotificacao, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

interface Stream {
    status: number;
    headers: http.IncomingHttpHeaders;
    /** Os dados do próximo evento com este nome, esteja ele já recebido ou por chegar. */
    next(event: string): Promise<unknown>;
    /** Resolve quando o servidor fecha a ligação. */
    ended: Promise<void>;
    close(): void;
}

let server: http.Server | null = null;

/** Um servidor a sério: o supertest ficava à espera do fim de uma resposta que não acaba. */
async function arrancar(): Promise<number> {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    return (server.address() as AddressInfo).port;
}

afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = null;
});

function abrirStream(port: number, caminho: string, headers: Record<string, string> = {}): Promise<Stream> {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port, path: caminho, headers }, (res) => {
            res.setEncoding("utf8");

            const recebidos: Array<{ event: string; data: unknown }> = [];
            const aEspera: Array<{ event: string; entregar: (data: unknown) => void }> = [];
            let buffer = "";

            const despachar = () => {
                for (let i = 0; i < aEspera.length; i++) {
                    const pedido = aEspera[i]!;
                    const indice = recebidos.findIndex((e) => e.event === pedido.event);
                    if (indice >= 0) {
                        const [evento] = recebidos.splice(indice, 1);
                        aEspera.splice(i--, 1);
                        pedido.entregar(evento!.data);
                    }
                }
            };

            res.on("data", (chunk: string) => {
                buffer += chunk;
                let fim = buffer.indexOf("\n\n");
                while (fim >= 0) {
                    const linhas = buffer.slice(0, fim).split("\n");
                    buffer = buffer.slice(fim + 2);
                    const event = linhas.find((l) => l.startsWith("event: "))?.slice("event: ".length);
                    const data = linhas.find((l) => l.startsWith("data: "))?.slice("data: ".length);
                    if (event && data !== undefined) {
                        recebidos.push({ event, data: JSON.parse(data) });
                    }
                    fim = buffer.indexOf("\n\n");
                }
                despachar();
            });

            const ended = new Promise<void>((done) => res.on("close", () => done()));

            resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                next: (event) => new Promise((entregar) => {
                    aEspera.push({ event, entregar });
                    despachar();
                }),
                ended,
                close: () => req.destroy(),
            });
        });
        req.on("error", reject);
    });
}

const pedirBilhete = async (header: string): Promise<string> =>
    (await request(app).post("/notifications/stream-ticket").set("Authorization", header)).body.data.ticket;

/** Um company_admin e uma employee ativa da mesma empresa. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await criarUtilizador({ companyId: admin.companyId, password: "Password1!" });

    return { admin, header, ana, doAna: authorization(ana) };
};

describe("POST /notifications/stream-ticket", () => {
    it("devolve um bilhete que dura 30 segundos", async () => {
        const { doAna } = await cenario();

        const res = await request(app).post("/notifications/stream-ticket").set("Authorization", doAna);

        expect(res.status).toBe(201);
        expect(res.body.data).toEqual({ ticket: expect.any(String), expiresInSeconds: 30 });
    });
});

describe("GET /notifications/stream", () => {
    it("manda o ready com o número por ler, e depois cada notificação nova", async () => {
        const { header, ana, doAna } = await cenario();
        await criarNotificacao(ana);
        await criarNotificacao(ana);
        const port = await arrancar();

        const stream = await abrirStream(port, `/notifications/stream?ticket=${await pedirBilhete(doAna)}`);

        expect(stream.status).toBe(200);
        expect(stream.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
        expect(await stream.next("ready")).toEqual({ unread: 2 });

        // Só depois do ready: o stream e este pedido partilham a transação do teste.
        const projeto = await criarProjeto(ana.companyId, "Website");
        await request(app).post("/allocations").set("Authorization", header).send({
            userId: ana.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(await stream.next("notification")).toMatchObject({
            type: "allocation.created",
            message: "Tem uma nova alocação no projeto Website (50%)",
            readAt: null,
        });
        stream.close();
    });

    it("também leva os avisos da empresa", async () => {
        const { header, doAna } = await cenario();
        const port = await arrancar();
        const stream = await abrirStream(port, `/notifications/stream?ticket=${await pedirBilhete(doAna)}`);
        await stream.next("ready");

        await request(app).post("/announcements").set("Authorization", header).send({
            scope: AnnouncementScope.Company,
            title: "Jantar de Natal",
            body: "Dia 19, às 20h.",
        });

        expect(await stream.next("announcement")).toMatchObject({
            action: "created",
            announcement: { title: "Jantar de Natal", active: true },
        });
        stream.close();
    });

    it("aceita o Bearer em vez do bilhete, para clientes com fetch", async () => {
        const { doAna } = await cenario();
        const port = await arrancar();

        const stream = await abrirStream(port, "/notifications/stream", { Authorization: doAna });

        expect(stream.status).toBe(200);
        expect(await stream.next("ready")).toEqual({ unread: 0 });
        stream.close();
    });

    it("suspender a conta fecha o stream com account_inactive", async () => {
        const { header, ana, doAna } = await cenario();
        const port = await arrancar();
        const stream = await abrirStream(port, `/notifications/stream?ticket=${await pedirBilhete(doAna)}`);
        await stream.next("ready");

        await request(app).patch(`/users/${ana.id}/status`).set("Authorization", header)
            .send({ status: UserStatus.Suspended });

        expect(await stream.next("close")).toEqual({ reason: "account_inactive" });
        await stream.ended;
    });

    it("um bilhete só serve uma vez", async () => {
        const { doAna } = await cenario();
        const port = await arrancar();
        const ticket = await pedirBilhete(doAna);
        const stream = await abrirStream(port, `/notifications/stream?ticket=${ticket}`);
        await stream.next("ready");
        stream.close();

        const outraVez = await request(app).get(`/notifications/stream?ticket=${ticket}`);

        expect(outraVez.status).toBe(401);
        expect(outraVez.body.message).toBe("Bilhete inválido ou expirado");
    });

    it("sem bilhete nem Bearer responde 401, e a um bilhete inventado também", async () => {
        expect((await request(app).get("/notifications/stream")).status).toBe(401);
        expect((await request(app).get("/notifications/stream?ticket=inventado")).status).toBe(401);
    });

    it("uma conta suspensa depois de pedir o bilhete leva 403", async () => {
        const { ana, doAna } = await cenario();
        const ticket = await pedirBilhete(doAna);
        await repo(User).update(ana.id, { status: UserStatus.Suspended });

        const res = await request(app).get(`/notifications/stream?ticket=${ticket}`);

        expect(res.status).toBe(403);
    });

    it("o log do pedido esconde o bilhete", async () => {
        await request(app).get("/notifications/stream?ticket=segredo123");

        const linhas = logSpy.mock.calls.map(([linha]) => String(linha));
        expect(linhas.some((linha) => linha.includes("/notifications/stream?ticket=[oculto] → 401"))).toBe(true);
        expect(linhas.some((linha) => linha.includes("segredo123"))).toBe(false);
    });
});

describe("streamTickets", () => {
    const payload = (expSegundos: number) => ({
        sub: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        companyId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        role: UserRole.Employee,
        iat: Math.floor(Date.now() / 1000),
        exp: expSegundos,
    });

    it("um bilhete expira ao fim de 30 segundos", () => {
        const { ticket } = streamTickets.issue(payload(Math.floor(Date.now() / 1000) + 3600));
        const agora = Date.now();
        const relogio = jest.spyOn(Date, "now").mockReturnValue(agora + 31_000);

        try {
            expect(streamTickets.consume(ticket)).toBeNull();
        } finally {
            relogio.mockRestore();
        }
    });

    it("nunca dura mais do que o token que o pediu", () => {
        const { ticket } = streamTickets.issue(payload(Math.floor(Date.now() / 1000) - 1));

        expect(streamTickets.consume(ticket)).toBeNull();
    });
});
