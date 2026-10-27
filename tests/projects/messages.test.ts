import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { ProjectMessage } from "../../src/entities/ProjectMessage.js";
import { ProjectMessageRead } from "../../src/entities/ProjectMessageRead.js";
import { UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarMensagem, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { eventsSentToUsers } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const mensagens = () => repo(ProjectMessage);
const marcas = () => repo(ProjectMessageRead);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
const escrever = (projetoId: string, header: string, body: unknown) =>
    request(app).post(`/projects/${projetoId}/messages`).set("Authorization", header).send({ body });
const corrigir = (projetoId: string, mensagemId: string, header: string, body: unknown) =>
    request(app).patch(`/projects/${projetoId}/messages/${mensagemId}`).set("Authorization", header).send({ body });
const apagar = (projetoId: string, mensagemId: string, header: string) =>
    request(app).delete(`/projects/${projetoId}/messages/${mensagemId}`).set("Authorization", header);
const marcarLido = (projetoId: string, header: string) =>
    request(app).post(`/projects/${projetoId}/messages/read`).set("Authorization", header);
const porLer = (header: string) => ler("/projects/messages/unread", header);

const ids = (res: request.Response) => res.body.data.items.map((m: { id: string }) => m.id);

/**
 * Um company_admin, a gestora do projeto (employee), a Ana e o Rui (alocados),
 * e a Sara, da mesma empresa mas fora do projeto.
 */
const cenario = async () => {
    const { user: admin, header: adminHeader } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const sara = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id });
    await criarAlocacao(ana.id, projeto.id);
    await criarAlocacao(rui.id, projeto.id);

    return { admin, adminHeader, gestora, ana, rui, sara, projeto };
};

describe("GET /projects/:id/messages", () => {
    it("quem está no projeto, a gestora e os admins leem; da mais recente para a mais antiga", async () => {
        const { adminHeader, gestora, ana, rui, projeto } = await cenario();
        const { header: sysHeader } = await createActor(UserRole.SystemAdmin);
        const primeira = await criarMensagem(projeto.id, ana.id, "Bom dia");
        const segunda = await criarMensagem(projeto.id, rui.id, "Bom dia, Ana");

        for (const header of [authorization(ana), authorization(gestora), adminHeader, sysHeader]) {
            const res = await ler(`/projects/${projeto.id}/messages`, header);

            expect(res.status).toBe(200);
            expect(ids(res)).toEqual([segunda.id, primeira.id]);
        }

        const res = await ler(`/projects/${projeto.id}/messages`, authorization(ana));
        expect(res.body.data).toEqual({
            items: [
                {
                    id: segunda.id,
                    projectId: projeto.id,
                    authorId: rui.id,
                    body: "Bom dia, Ana",
                    createdAt: segunda.createdAt.toISOString(),
                    editedAt: null,
                },
                expect.objectContaining({ id: primeira.id }),
            ],
            nextBefore: null,
            lastReadMessageId: null,
        });
    });

    it("às páginas, com o nextBefore como before", async () => {
        const { ana, projeto } = await cenario();
        const [m1, m2, m3, m4, m5] = [
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
        ];
        const pagina = (query: string) => ler(`/projects/${projeto.id}/messages?${query}`, authorization(ana));

        const primeira = await pagina("limit=2");
        const segunda = await pagina(`limit=2&before=${primeira.body.data.nextBefore}`);
        const terceira = await pagina(`limit=2&before=${segunda.body.data.nextBefore}`);

        expect(ids(primeira)).toEqual([m5!.id, m4!.id]);
        expect(primeira.body.data.nextBefore).toBe(m4!.id);
        expect(ids(segunda)).toEqual([m3!.id, m2!.id]);
        expect(ids(terceira)).toEqual([m1!.id]);
        expect(terceira.body.data.nextBefore).toBeNull();
    });

    it("alguém da empresa fora do projeto recebe 403; de outra empresa, 404; quem já saiu, 403", async () => {
        const { admin, sara, projeto } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);
        const saiu = await ativo(admin.companyId);
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2025-01-01", endDate: "2025-12-31" });

        const daEmpresa = await ler(`/projects/${projeto.id}/messages`, authorization(sara));

        expect(daEmpresa.status).toBe(403);
        expect(daEmpresa.body.message).toBe("Só quem está no projeto vê as mensagens");
        expect((await ler(`/projects/${projeto.id}/messages`, deFora)).status).toBe(404);
        expect((await ler(`/projects/${projeto.id}/messages`, authorization(saiu))).status).toBe(403);
        expect((await escrever(projeto.id, authorization(sara), "Olá")).status).toBe(403);
    });
});

describe("POST /projects/:id/messages", () => {
    it("grava, e manda em direto a quem está no projeto, à gestora e aos admins da empresa", async () => {
        const { admin, gestora, ana, rui, sara, projeto } = await cenario();
        const outroAdmin = await ativo(admin.companyId, UserRole.CompanyAdmin);

        const res = await escrever(projeto.id, authorization(ana), "  O deploy de teste já está feito.  ");

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Mensagem enviada" });
        expect(res.body.data).toMatchObject({
            projectId: projeto.id,
            authorId: ana.id,
            body: "O deploy de teste já está feito.",
            editedAt: null,
        });
        expect(await mensagens().countBy({ projectId: projeto.id })).toBe(1);

        const enviados = eventsSentToUsers("project_message");
        expect(enviados).toHaveLength(1);
        const [destinatarios, evento] = enviados[0]!;
        expect([...new Set(destinatarios)].sort()).toEqual([admin.id, outroAdmin.id, gestora.id, ana.id, rui.id].sort());
        expect(destinatarios).not.toContain(sara.id);
        expect(evento).toEqual({ action: "created", message: res.body.data });
    });

    it("vazia ou com mais de 2000 caracteres é 400", async () => {
        const { ana, projeto } = await cenario();

        expect((await escrever(projeto.id, authorization(ana), "   ")).status).toBe(400);
        expect((await escrever(projeto.id, authorization(ana), "a".repeat(2001))).status).toBe(400);
        expect(await mensagens().countBy({ projectId: projeto.id })).toBe(0);
    });
});

describe("PATCH /projects/:id/messages/:messageId", () => {
    it("quem a escreveu corrige: fica com o editedAt, e vai em direto", async () => {
        const { ana, projeto } = await cenario();
        const mensagem = await criarMensagem(projeto.id, ana.id, "Reunião às 10h");

        const res = await corrigir(projeto.id, mensagem.id, authorization(ana), "Reunião às 11h");

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ id: mensagem.id, body: "Reunião às 11h" });
        expect(res.body.data.editedAt).not.toBeNull();
        expect(eventsSentToUsers("project_message")[0]?.[1]).toEqual({ action: "updated", message: res.body.data });
    });

    it("nem um admin reescreve o que outra pessoa escreveu", async () => {
        const { adminHeader, gestora, ana, projeto } = await cenario();
        const mensagem = await criarMensagem(projeto.id, ana.id, "Original");

        const doAdmin = await corrigir(projeto.id, mensagem.id, adminHeader, "Mudado");
        const daGestora = await corrigir(projeto.id, mensagem.id, authorization(gestora), "Mudado");

        expect(doAdmin.status).toBe(403);
        expect(doAdmin.body.message).toBe("Só quem escreveu a mensagem a pode alterar");
        expect(daGestora.status).toBe(403);
        expect((await mensagens().findOneByOrFail({ id: mensagem.id })).body).toBe("Original");
    });

    it("uma mensagem de outro projeto é 404", async () => {
        const { admin, ana, projeto } = await cenario();
        const outro = await criarProjeto(admin.companyId);
        const alheia = await criarMensagem(outro.id, ana.id);

        const res = await corrigir(projeto.id, alheia.id, authorization(ana), "Mudado");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Mensagem não encontrada");
    });
});

describe("DELETE /projects/:id/messages/:messageId", () => {
    it("o Rui não apaga a da Ana; a Ana apaga a sua; a gestora e um admin apagam qualquer uma", async () => {
        const { adminHeader, gestora, ana, rui, projeto } = await cenario();
        const [a, b, c] = [
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
            await criarMensagem(projeto.id, ana.id),
        ];

        expect((await apagar(projeto.id, a!.id, authorization(rui))).status).toBe(403);
        expect((await apagar(projeto.id, a!.id, authorization(ana))).status).toBe(200);
        expect((await apagar(projeto.id, b!.id, authorization(gestora))).status).toBe(200);
        expect((await apagar(projeto.id, c!.id, adminHeader)).status).toBe(200);
        expect(await mensagens().countBy({ projectId: projeto.id })).toBe(0);
        expect(eventsSentToUsers("project_message").map(([, evento]) => evento)).toEqual([
            { action: "deleted", projectId: projeto.id, id: a!.id },
            { action: "deleted", projectId: projeto.id, id: b!.id },
            { action: "deleted", projectId: projeto.id, id: c!.id },
        ]);
    });
});

describe("Mensagens por ler", () => {
    it("contam só as dos outros; escrever e marcar como lido põem a marca no fim", async () => {
        const { ana, rui, projeto } = await cenario();
        await escrever(projeto.id, authorization(ana), "Alguém viu o erro do login?");
        await criarMensagem(projeto.id, rui.id, "Vi, já trato");
        await criarMensagem(projeto.id, rui.id, "Está corrigido");

        // A Ana tem as duas do Rui por ler. O Rui escreveu depois da Ana, mas
        // por fixture, sem passar pela API: tem a dela por ler.
        expect((await porLer(authorization(ana))).body.data).toEqual({
            total: 2,
            projects: [{ projectId: projeto.id, unread: 2 }],
        });
        expect((await porLer(authorization(rui))).body.data.total).toBe(1);

        const lido = await marcarLido(projeto.id, authorization(ana));
        const ultima = await mensagens().findOneOrFail({ where: { projectId: projeto.id }, order: { id: "DESC" } });

        expect(lido.status).toBe(200);
        expect(lido.body.data).toEqual({ lastReadMessageId: ultima.id });
        expect((await porLer(authorization(ana))).body.data).toEqual({ total: 0, projects: [] });
        expect((await ler(`/projects/${projeto.id}/messages`, authorization(ana))).body.data.lastReadMessageId)
            .toBe(ultima.id);

        // Uma nova do Rui volta a contar.
        await escrever(projeto.id, authorization(rui), "Mais uma coisa");
        expect((await porLer(authorization(ana))).body.data.total).toBe(1);
        expect((await porLer(authorization(rui))).body.data.total).toBe(0);
    });

    it("marcar outra vez não cria outra marca, e com o chat vazio não há nada a marcar", async () => {
        const { ana, rui, projeto } = await cenario();
        const vazio = await criarProjeto(projeto.companyId, "Vazio", { managerId: ana.id });

        expect((await marcarLido(vazio.id, authorization(ana))).body.data).toEqual({ lastReadMessageId: null });

        await criarMensagem(projeto.id, rui.id);
        await marcarLido(projeto.id, authorization(ana));
        await marcarLido(projeto.id, authorization(ana));

        expect(await marcas().countBy({ userId: ana.id })).toBe(1);
    });

    it("só contam os projetos em que a pessoa está ou que gere", async () => {
        const { admin, adminHeader, gestora, ana, rui, projeto } = await cenario();
        const antigo = await criarProjeto(admin.companyId, "Antigo");
        await criarAlocacao(ana.id, antigo.id, { startDate: "2025-01-01", endDate: "2025-12-31" });
        await criarMensagem(projeto.id, rui.id);
        await criarMensagem(antigo.id, rui.id);

        // O admin lê o chat de qualquer projeto da empresa, mas não está em nenhum.
        expect((await porLer(adminHeader)).body.data).toEqual({ total: 0, projects: [] });
        expect((await porLer(authorization(gestora))).body.data.projects).toEqual([{ projectId: projeto.id, unread: 1 }]);
        expect((await porLer(authorization(ana))).body.data.projects).toEqual([{ projectId: projeto.id, unread: 1 }]);
    });
});
