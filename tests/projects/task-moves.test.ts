import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { ProjectTask } from "../../src/entities/ProjectTask.js";
import { TaskStatus, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarProjeto, criarTarefa, criarUtilizador } from "../helpers/factories.js";
import { eventsSentToUsers } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const tarefas = () => repo(ProjectTask);
const notificacoes = () => repo(Notification);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const mover = (projetoId: string, tarefaId: string, header: string, status: string, position: number) =>
    request(app)
        .post(`/projects/${projetoId}/tasks/${tarefaId}/move`)
        .set("Authorization", header)
        .send({ status, position });

/** Uma coluna como está gravada: [id, position], pela ordem do quadro. */
const coluna = async (projectId: string, status: TaskStatus) =>
    (await tarefas().find({ where: { projectId, status }, order: { position: "ASC", id: "ASC" } }))
        .map((t) => [t.id, t.position]);

const enviadas = async (type: string) =>
    (await notificacoes().find({ where: { type }, order: { id: "ASC" } }))
        .map(({ recipientId, data }) => ({ recipientId, data }));

/** A gestora do projeto (employee), um company_admin, e a Ana e o Rui, alocados. */
const cenario = async () => {
    const { user: admin, header: adminHeader } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id });
    await criarAlocacao(ana.id, projeto.id);
    await criarAlocacao(rui.id, projeto.id);

    return { admin, adminHeader, gestora, ana, rui, projeto };
};

describe("POST /projects/:id/tasks/:taskId/move: a ordem", () => {
    it("muda de lugar dentro da coluna, e a coluna fica de 0 a n-1", async () => {
        const { ana, projeto } = await cenario();
        const [a, b, c] = [
            await criarTarefa(projeto.id, ana.id, { position: 3 }),
            await criarTarefa(projeto.id, ana.id, { position: 7 }),
            await criarTarefa(projeto.id, ana.id, { position: 20 }),
        ];

        const res = await mover(projeto.id, c!.id, authorization(ana), "todo", 0);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Tarefa movida" });
        expect(res.body.data.order).toEqual({ todo: [c!.id, a!.id, b!.id] });
        expect(res.body.data.task).toMatchObject({ id: c!.id, status: TaskStatus.Todo, position: 0 });
        expect(await coluna(projeto.id, TaskStatus.Todo)).toEqual([[c!.id, 0], [a!.id, 1], [b!.id, 2]]);
    });

    it("muda de coluna: as duas ficam renumeradas, e o evento leva a ordem das duas", async () => {
        const { ana, projeto } = await cenario();
        const [a, b, c] = [
            await criarTarefa(projeto.id, ana.id),
            await criarTarefa(projeto.id, ana.id),
            await criarTarefa(projeto.id, ana.id),
        ];
        const [x, y] = [
            await criarTarefa(projeto.id, ana.id, { status: TaskStatus.InProgress }),
            await criarTarefa(projeto.id, ana.id, { status: TaskStatus.InProgress }),
        ];

        const res = await mover(projeto.id, b!.id, authorization(ana), "in_progress", 1);

        expect(res.status).toBe(200);
        expect(res.body.data.order).toEqual({ in_progress: [x!.id, b!.id, y!.id], todo: [a!.id, c!.id] });
        expect(await coluna(projeto.id, TaskStatus.InProgress)).toEqual([[x!.id, 0], [b!.id, 1], [y!.id, 2]]);
        expect(await coluna(projeto.id, TaskStatus.Todo)).toEqual([[a!.id, 0], [c!.id, 1]]);

        const [destinatarios, evento] = eventsSentToUsers("project_task")[0]!;
        expect(destinatarios).toContain(ana.id);
        expect(evento).toEqual({ action: "moved", ...res.body.data });
    });

    it("um lugar acima do fim fica no fim; para uma coluna vazia fica em 0", async () => {
        const { ana, projeto } = await cenario();
        const a = await criarTarefa(projeto.id, ana.id);
        const b = await criarTarefa(projeto.id, ana.id);

        const fim = await mover(projeto.id, a.id, authorization(ana), "todo", 99);
        const vazia = await mover(projeto.id, a.id, authorization(ana), "review", 5);

        expect(fim.body.data.order).toEqual({ todo: [b.id, a.id] });
        expect(vazia.body.data.order).toEqual({ review: [a.id], todo: [b.id] });
        expect(vazia.body.data.task.position).toBe(0);
    });

    it("um lugar negativo ou um status desconhecido é 400", async () => {
        const { ana, projeto } = await cenario();
        const a = await criarTarefa(projeto.id, ana.id);

        expect((await mover(projeto.id, a.id, authorization(ana), "todo", -1)).status).toBe(400);
        expect((await mover(projeto.id, a.id, authorization(ana), "arquivo", 0)).status).toBe(400);
    });
});

describe("POST /projects/:id/tasks/:taskId/move: o fluxo", () => {
    it("o Rui não mexe na tarefa da Ana, mas mexe numa sem responsável", async () => {
        const { ana, rui, projeto } = await cenario();
        const daAna = await criarTarefa(projeto.id, ana.id, { assigneeId: ana.id });
        const deNinguem = await criarTarefa(projeto.id, ana.id);

        const res = await mover(projeto.id, daAna.id, authorization(rui), "in_progress", 0);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Só o responsável pela tarefa, o gestor ou um administrador a move");
        expect((await tarefas().findOneByOrFail({ id: daAna.id })).status).toBe(TaskStatus.Todo);
        expect((await mover(projeto.id, deNinguem.id, authorization(rui), "in_progress", 0)).status).toBe(200);
    });

    it("de in_progress não se salta para done, nem a gestora", async () => {
        const { gestora, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.InProgress, assigneeId: ana.id });

        const res = await mover(projeto.id, tarefa.id, authorization(gestora), "done", 0);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([{ field: "status", message: "Uma tarefa só passa a concluída depois da revisão" }]);
    });

    it("a Ana manda a sua para revisão, e a gestora fica a saber", async () => {
        const { gestora, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.InProgress, assigneeId: ana.id, title: "Login" });

        const res = await mover(projeto.id, tarefa.id, authorization(ana), "review", 0);

        expect(res.status).toBe(200);
        expect(await enviadas("task.review_requested")).toEqual([{
            recipientId: gestora.id,
            data: { taskId: tarefa.id, taskTitle: "Login", projectId: projeto.id, projectName: "Portal" },
        }]);
    });

    it("só quem gere aprova; ao aprovar, a Ana sabe e fica com completedAt", async () => {
        const { adminHeader, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review, assigneeId: ana.id, title: "Login" });

        const daAna = await mover(projeto.id, tarefa.id, authorization(ana), "done", 0);

        expect(daAna.status).toBe(403);
        expect(daAna.body.message).toBe("Só o gestor do projeto ou um administrador aprova tarefas");

        const res = await mover(projeto.id, tarefa.id, adminHeader, "done", 0);

        expect(res.status).toBe(200);
        expect(res.body.data.task.completedAt).not.toBeNull();
        expect(await enviadas("task.reviewed")).toEqual([{
            recipientId: ana.id,
            data: { taskId: tarefa.id, taskTitle: "Login", projectId: projeto.id, projectName: "Portal", approved: true },
        }]);
    });

    it("a gestora devolve da revisão: a Ana sabe que não foi aprovada", async () => {
        const { gestora, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review, assigneeId: ana.id });

        await mover(projeto.id, tarefa.id, authorization(gestora), "in_progress", 0);

        expect((await enviadas("task.reviewed")).map((n) => [n.recipientId, n.data.approved])).toEqual([[ana.id, false]]);
    });

    it("quem tira a sua da revisão não se notifica a si própria", async () => {
        const { ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review, assigneeId: ana.id });

        expect((await mover(projeto.id, tarefa.id, authorization(ana), "in_progress", 0)).status).toBe(200);
        expect(await enviadas("task.reviewed")).toEqual([]);
    });

    it("só quem gere reabre uma concluída, e o completedAt sai", async () => {
        const { gestora, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Done, assigneeId: ana.id });

        expect((await mover(projeto.id, tarefa.id, authorization(ana), "todo", 0)).status).toBe(403);

        const res = await mover(projeto.id, tarefa.id, authorization(gestora), "in_progress", 0);

        expect(res.status).toBe(200);
        expect(res.body.data.task.completedAt).toBeNull();
        expect((await tarefas().findOneByOrFail({ id: tarefa.id })).completedAt).toBeNull();
    });

    it("mudar de lugar dentro de review não pede revisão outra vez", async () => {
        const { gestora, ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review, assigneeId: ana.id });
        await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review });

        expect((await mover(projeto.id, tarefa.id, authorization(gestora), "review", 1)).status).toBe(200);
        expect(await enviadas("task.review_requested")).toEqual([]);
        expect(await enviadas("task.reviewed")).toEqual([]);
    });
});
