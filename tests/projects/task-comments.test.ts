import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { ProjectTaskComment } from "../../src/entities/ProjectTaskComment.js";
import { UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarComentario,
    criarProjeto,
    criarTarefa,
    criarUtilizador,
} from "../helpers/factories.js";
import { eventsSentToUsers } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const comentarios = () => repo(ProjectTaskComment);
const notificacoes = () => repo(Notification);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const caminho = (projetoId: string, tarefaId: string, comentarioId?: string) =>
    `/projects/${projetoId}/tasks/${tarefaId}/comments${comentarioId ? `/${comentarioId}` : ""}`;

const ler = (url: string, header: string) => request(app).get(url).set("Authorization", header);
const comentar = (url: string, header: string, body: unknown) =>
    request(app).post(url).set("Authorization", header).send({ body });
const corrigir = (url: string, header: string, body: unknown) =>
    request(app).patch(url).set("Authorization", header).send({ body });
const apagar = (url: string, header: string) => request(app).delete(url).set("Authorization", header);

/** A gestora do projeto (employee), um company_admin, a Ana e o Rui (alocados), e a Sara, de fora. */
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

describe("Comentários de uma tarefa", () => {
    it("lista do mais antigo para o mais recente; o quadro conta-os", async () => {
        const { ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const primeiro = await criarComentario(tarefa.id, rui.id, "Primeiro");
        const segundo = await criarComentario(tarefa.id, ana.id, "Segundo");

        const res = await ler(caminho(projeto.id, tarefa.id), authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            {
                id: primeiro.id,
                taskId: tarefa.id,
                authorId: rui.id,
                body: "Primeiro",
                createdAt: primeiro.createdAt.toISOString(),
                editedAt: null,
            },
            expect.objectContaining({ id: segundo.id }),
        ]);

        const quadro = await ler(`/projects/${projeto.id}/tasks`, authorization(ana));
        expect(quadro.body.data.todo[0].commentCount).toBe(2);
    });

    it("comentar avisa o responsável e quem criou a tarefa, nunca quem comentou; vai em direto", async () => {
        const { gestora, ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, gestora.id, { assigneeId: ana.id, title: "Login" });

        const res = await comentar(caminho(projeto.id, tarefa.id), authorization(rui), "  Já está no servidor de testes.  ");

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ taskId: tarefa.id, authorId: rui.id, body: "Já está no servidor de testes." });

        const avisados = await notificacoes().find({ where: { type: "task.commented" } });
        expect(avisados.map((n) => n.recipientId).sort()).toEqual([gestora.id, ana.id].sort());
        expect(avisados[0]?.data).toEqual({ taskId: tarefa.id, taskTitle: "Login", projectId: projeto.id, projectName: "Portal" });

        expect(eventsSentToUsers("project_task_comment")[0]?.[1])
            .toEqual({ action: "created", projectId: projeto.id, comment: res.body.data });

        // A Ana comenta a sua: só a gestora, que criou a tarefa, recebe.
        await comentar(caminho(projeto.id, tarefa.id), authorization(ana), "Obrigada");
        expect(await notificacoes().countBy({ type: "task.commented", recipientId: ana.id })).toBe(1);
    });

    it("vazio ou com mais de 2000 caracteres é 400; alguém fora do projeto é 403", async () => {
        const { ana, sara, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const url = caminho(projeto.id, tarefa.id);

        expect((await comentar(url, authorization(ana), "  ")).status).toBe(400);
        expect((await comentar(url, authorization(ana), "a".repeat(2001))).status).toBe(400);
        expect((await comentar(url, authorization(sara), "Olá")).status).toBe(403);
        expect((await ler(url, authorization(sara))).status).toBe(403);
        expect(await comentarios().countBy({ taskId: tarefa.id })).toBe(0);
    });

    it("só quem escreveu corrige, nem um admin; fica com o editedAt", async () => {
        const { adminHeader, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const comentario = await criarComentario(tarefa.id, ana.id, "Original");
        const url = caminho(projeto.id, tarefa.id, comentario.id);

        const doAdmin = await corrigir(url, adminHeader, "Mudado");

        expect(doAdmin.status).toBe(403);
        expect(doAdmin.body.message).toBe("Só quem escreveu o comentário o pode alterar");

        const res = await corrigir(url, authorization(ana), "Corrigido");

        expect(res.status).toBe(200);
        expect(res.body.data.body).toBe("Corrigido");
        expect(res.body.data.editedAt).not.toBeNull();
        expect(eventsSentToUsers("project_task_comment")[0]?.[1])
            .toEqual({ action: "updated", projectId: projeto.id, comment: res.body.data });
    });

    it("apaga quem escreveu, a gestora ou um admin; o Rui não apaga o da Ana", async () => {
        const { adminHeader, gestora, ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const [a, b, c] = [
            await criarComentario(tarefa.id, ana.id),
            await criarComentario(tarefa.id, ana.id),
            await criarComentario(tarefa.id, ana.id),
        ];

        expect((await apagar(caminho(projeto.id, tarefa.id, a!.id), authorization(rui))).status).toBe(403);
        expect((await apagar(caminho(projeto.id, tarefa.id, a!.id), authorization(ana))).status).toBe(200);
        expect((await apagar(caminho(projeto.id, tarefa.id, b!.id), authorization(gestora))).status).toBe(200);
        expect((await apagar(caminho(projeto.id, tarefa.id, c!.id), adminHeader)).status).toBe(200);
        expect(await comentarios().countBy({ taskId: tarefa.id })).toBe(0);
        expect(eventsSentToUsers("project_task_comment")[0]?.[1])
            .toEqual({ action: "deleted", projectId: projeto.id, taskId: tarefa.id, id: a!.id });
    });

    it("um comentário de outra tarefa é 404", async () => {
        const { ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const outra = await criarTarefa(projeto.id, ana.id);
        const alheio = await criarComentario(outra.id, ana.id);

        const res = await corrigir(caminho(projeto.id, tarefa.id, alheio.id), authorization(ana), "Meu");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Comentário não encontrado");
    });
});
