import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarNotificacao, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const notificacoes = () => repo(Notification);

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
const marcar = (caminho: string, header: string) => request(app).post(caminho).set("Authorization", header);

/** Duas pessoas ativas da mesma empresa. */
const cenario = async () => {
    const { user: ana, header } = await createActor(UserRole.Employee);
    const rui = await criarUtilizador({ companyId: ana.companyId, password: "Password1!" });

    return { ana, header, rui };
};

describe("GET /notifications/mine", () => {
    it("lista só as da própria pessoa, da mais recente para a mais antiga, com a mensagem do catálogo", async () => {
        const { ana, header, rui } = await cenario();
        const antiga = await criarNotificacao(ana, { data: { projectId: ana.id, projectName: "Alfa" } });
        const recente = await criarNotificacao(ana, { data: { projectId: ana.id, projectName: "Beta" } });
        await criarNotificacao(rui);

        const res = await ler("/notifications/mine", header);

        expect(res.status).toBe(200);
        expect(res.body.data.nextBefore).toBeNull();
        expect(res.body.data.items.map((n: { id: string }) => n.id)).toEqual([recente.id, antiga.id]);
        expect(res.body.data.items[0]).toEqual({
            id: recente.id,
            type: "project.manager_assigned",
            message: "Passaste a gerir o projeto Beta",
            data: { projectId: ana.id, projectName: "Beta" },
            readAt: null,
            createdAt: recente.createdAt.toISOString(),
        });
    });

    it("pagina pelo nextBefore, sem repetir nem saltar nenhuma", async () => {
        const { ana, header } = await cenario();
        const [primeira, segunda, terceira] = [
            await criarNotificacao(ana),
            await criarNotificacao(ana),
            await criarNotificacao(ana),
        ];

        const pagina1 = await ler("/notifications/mine?limit=2", header);
        const pagina2 = await ler(`/notifications/mine?limit=2&before=${pagina1.body.data.nextBefore}`, header);

        expect(pagina1.body.data.items.map((n: { id: string }) => n.id)).toEqual([terceira!.id, segunda!.id]);
        expect(pagina1.body.data.nextBefore).toBe(segunda!.id);
        expect(pagina2.body.data.items.map((n: { id: string }) => n.id)).toEqual([primeira!.id]);
        expect(pagina2.body.data.nextBefore).toBeNull();
    });

    it("com ?unread=true deixa só as por ler", async () => {
        const { ana, header } = await cenario();
        const porLer = await criarNotificacao(ana);
        await criarNotificacao(ana, { readAt: new Date() });

        const res = await ler("/notifications/mine?unread=true", header);

        expect(res.body.data.items.map((n: { id: string }) => n.id)).toEqual([porLer.id]);
    });

    it("recusa um limit fora de 1 a 100 e um before que não é um uuid", async () => {
        const { header } = await cenario();

        expect((await ler("/notifications/mine?limit=0", header)).status).toBe(400);
        expect((await ler("/notifications/mine?limit=101", header)).status).toBe(400);
        expect((await ler("/notifications/mine?before=ontem", header)).status).toBe(400);
    });

    it("um tipo que saiu do catálogo mostra o próprio tipo em vez de rebentar", async () => {
        const { ana, header } = await cenario();
        await criarNotificacao(ana, { type: "coisa.que.ja.nao.existe", data: {} });
        await criarNotificacao(ana, { type: "allocation.ended", data: { faltam: "campos" } });

        const res = await ler("/notifications/mine", header);

        expect(res.status).toBe(200);
        expect(res.body.data.items.map((n: { message: string }) => n.message).sort()).toEqual([
            "allocation.ended",
            "coisa.que.ja.nao.existe",
        ]);
    });

    it("pede autenticação", async () => {
        const res = await request(app).get("/notifications/mine");

        expect(res.status).toBe(401);
    });
});

describe("GET /notifications/mine/unread-count", () => {
    it("conta só as por ler da própria pessoa", async () => {
        const { ana, header, rui } = await cenario();
        await criarNotificacao(ana);
        await criarNotificacao(ana);
        await criarNotificacao(ana, { readAt: new Date() });
        await criarNotificacao(rui);

        const res = await ler("/notifications/mine/unread-count", header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ unread: 2 });
    });
});

describe("POST /notifications/:id/read", () => {
    it("marca como lida, e marcar outra vez guarda a hora da primeira", async () => {
        const { ana, header } = await cenario();
        const notificacao = await criarNotificacao(ana);

        const primeira = await marcar(`/notifications/${notificacao.id}/read`, header);
        const segunda = await marcar(`/notifications/${notificacao.id}/read`, header);

        expect(primeira.status).toBe(200);
        expect(primeira.body.data.readAt).not.toBeNull();
        expect(segunda.body.data.readAt).toBe(primeira.body.data.readAt);
        expect((await notificacoes().findOneByOrFail({ id: notificacao.id })).readAt?.toISOString())
            .toBe(primeira.body.data.readAt);
    });

    it("responde 404 à notificação de outra pessoa, e a um id que não é uuid", async () => {
        const { header, rui } = await cenario();
        const alheia = await criarNotificacao(rui);

        const deOutro = await marcar(`/notifications/${alheia.id}/read`, header);
        const invalido = await marcar("/notifications/nao-e-um-id/read", header);

        expect(deOutro.status).toBe(404);
        expect(invalido.status).toBe(404);
        expect((await notificacoes().findOneByOrFail({ id: alheia.id })).readAt).toBeNull();
    });
});

describe("POST /notifications/mine/read-all", () => {
    it("marca todas as da própria pessoa e diz quantas", async () => {
        const { ana, header, rui } = await cenario();
        await criarNotificacao(ana);
        await criarNotificacao(ana);
        await criarNotificacao(ana, { readAt: new Date() });
        const alheia = await criarNotificacao(rui);

        const res = await marcar("/notifications/mine/read-all", header);
        const contagem = await ler("/notifications/mine/unread-count", header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ updated: 2 });
        expect(contagem.body.data).toEqual({ unread: 0 });
        expect((await notificacoes().findOneByOrFail({ id: alheia.id })).readAt).toBeNull();
    });

    it("não está ao alcance de um token de outra pessoa", async () => {
        const { ana, rui } = await cenario();
        await criarNotificacao(ana);

        await marcar("/notifications/mine/read-all", authorization(rui));

        expect(await notificacoes().countBy({ recipientId: ana.id })).toBe(1);
        expect((await ler("/notifications/mine/unread-count", authorization(ana))).body.data).toEqual({ unread: 1 });
    });
});
