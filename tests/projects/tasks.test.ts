import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { ProjectTask } from "../../src/entities/ProjectTask.js";
import { StoredFile } from "../../src/entities/StoredFile.js";
import { FileKind, TaskPriority, TaskStatus, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarComentario,
    criarProjeto,
    criarTarefa,
    criarUtilizador,
} from "../helpers/factories.js";
import { enviarFicheiro, noDisco, pdf, png } from "../helpers/files.js";
import { eventsSentToUsers } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const tarefas = () => repo(ProjectTask);
const ficheiros = () => repo(StoredFile);
const notificacoes = () => repo(Notification);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
const criar = (projetoId: string, header: string, body: object) =>
    request(app).post(`/projects/${projetoId}/tasks`).set("Authorization", header).send(body);
const alterar = (projetoId: string, tarefaId: string, header: string, body: object) =>
    request(app).patch(`/projects/${projetoId}/tasks/${tarefaId}`).set("Authorization", header).send(body);
const apagar = (caminho: string, header: string) => request(app).delete(caminho).set("Authorization", header);
const anexar = (projetoId: string, tarefaId: string, header: string, bytes: Buffer, nome = "erro.pdf") =>
    enviarFicheiro(`/projects/${projetoId}/tasks/${tarefaId}/attachments`, header, bytes, nome);

/** As notificações de um tipo, com quem as recebeu. */
const enviadas = async (type: string) =>
    (await notificacoes().find({ where: { type }, order: { id: "ASC" } }))
        .map(({ recipientId, data }) => ({ recipientId, data }));

const ids = (coluna: Array<{ id: string }>) => coluna.map((t) => t.id);

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

describe("GET /projects/:id/tasks", () => {
    it("devolve as quatro colunas, cada uma pela sua ordem, com anexos e comentários", async () => {
        const { gestora, ana, rui, projeto } = await cenario();
        const segunda = await criarTarefa(projeto.id, ana.id, { position: 5 });
        const primeira = await criarTarefa(projeto.id, ana.id, { position: 1 });
        const emRevisao = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Review, assigneeId: ana.id });
        const feita = await criarTarefa(projeto.id, ana.id, { status: TaskStatus.Done });
        await criarComentario(primeira.id, rui.id);
        await criarComentario(primeira.id, ana.id);

        const res = await ler(`/projects/${projeto.id}/tasks`, authorization(gestora));

        expect(res.status).toBe(200);
        expect(ids(res.body.data.todo)).toEqual([primeira.id, segunda.id]);
        expect(res.body.data.in_progress).toEqual([]);
        expect(ids(res.body.data.review)).toEqual([emRevisao.id]);
        expect(ids(res.body.data.done)).toEqual([feita.id]);
        expect(res.body.data.todo[0]).toMatchObject({ commentCount: 2, attachments: [] });
        expect(res.body.data.review[0]).toMatchObject({
            projectId: projeto.id,
            status: TaskStatus.Review,
            assigneeId: ana.id,
            priority: TaskPriority.Medium,
            labels: [],
            completedAt: null,
            commentCount: 0,
        });
        expect(res.body.data.done[0].completedAt).not.toBeNull();
    });

    it("filtra por responsável, etiqueta e prioridade, e os filtros juntam-se", async () => {
        const { ana, rui, projeto } = await cenario();
        const daAna = await criarTarefa(projeto.id, ana.id, { assigneeId: ana.id, labels: ["bug"] });
        const daAnaUrgente = await criarTarefa(projeto.id, ana.id, {
            assigneeId: ana.id,
            labels: ["bug", "frontend"],
            priority: TaskPriority.Critical,
        });
        await criarTarefa(projeto.id, ana.id, { assigneeId: rui.id, labels: ["bug"] });
        const quadro = (query: string) => ler(`/projects/${projeto.id}/tasks?${query}`, authorization(ana));

        expect(ids((await quadro(`assigneeId=${ana.id}`)).body.data.todo)).toEqual([daAna.id, daAnaUrgente.id]);
        expect(ids((await quadro("label=FRONTEND")).body.data.todo)).toEqual([daAnaUrgente.id]);
        expect(ids((await quadro(`assigneeId=${ana.id}&priority=critical`)).body.data.todo)).toEqual([daAnaUrgente.id]);
        expect((await quadro("priority=urgente")).status).toBe(400);
    });

    it("alguém da empresa fora do projeto recebe 403; de outra empresa, 404; quem já saiu, 403", async () => {
        const { admin, sara, projeto } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);
        const saiu = await ativo(admin.companyId);
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2025-01-01", endDate: "2025-12-31" });

        const daEmpresa = await ler(`/projects/${projeto.id}/tasks`, authorization(sara));

        expect(daEmpresa.status).toBe(403);
        expect(daEmpresa.body.message).toBe("Só quem está no projeto vê as tarefas");
        expect((await ler(`/projects/${projeto.id}/tasks`, deFora)).status).toBe(404);
        expect((await ler(`/projects/${projeto.id}/tasks`, authorization(saiu))).status).toBe(403);
    });
});

describe("GET /projects/:id/tasks/labels", () => {
    it("as etiquetas em uso, sem repetidas e por ordem", async () => {
        const { admin, ana, projeto } = await cenario();
        await criarTarefa(projeto.id, ana.id, { labels: ["frontend", "bug"] });
        await criarTarefa(projeto.id, ana.id, { labels: ["bug", "api"] });
        await criarTarefa((await criarProjeto(admin.companyId)).id, admin.id, { labels: ["de-outro"] });

        const res = await ler(`/projects/${projeto.id}/tasks/labels`, authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(["api", "bug", "frontend"]);
    });
});

describe("POST /projects/:id/tasks", () => {
    it("fica no fundo de todo, com prioridade medium, e vai em direto", async () => {
        const { ana, projeto } = await cenario();
        await criarTarefa(projeto.id, ana.id, { position: 7 });

        const res = await criar(projeto.id, authorization(ana), {
            title: "  Corrigir o login  ",
            labels: ["Bug", " bug ", "Frontend"],
            dueDate: "2026-11-15",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Tarefa criada" });
        expect(res.body.data).toMatchObject({
            title: "Corrigir o login",
            status: TaskStatus.Todo,
            position: 8,
            priority: TaskPriority.Medium,
            labels: ["bug", "frontend"],
            dueDate: "2026-11-15",
            assigneeId: null,
            createdBy: ana.id,
            completedAt: null,
            commentCount: 0,
            attachments: [],
        });
        expect(eventsSentToUsers("project_task")[0]?.[1]).toEqual({ action: "created", task: res.body.data });
    });

    it("pode começar em in_progress, mas nunca em review nem em done", async () => {
        const { ana, projeto } = await cenario();

        const emCurso = await criar(projeto.id, authorization(ana), { title: "A", status: "in_progress" });

        expect(emCurso.status).toBe(201);
        expect(emCurso.body.data).toMatchObject({ status: TaskStatus.InProgress, position: 0 });

        for (const status of ["review", "done"]) {
            const res = await criar(projeto.id, authorization(ana), { title: "B", status });

            expect(res.status).toBe(400);
            expect(res.body.data).toEqual([{ field: "status", message: "Uma tarefa nova começa em todo ou in_progress" }]);
        }
    });

    it("o responsável recebe task.assigned; quem se atribui a si próprio, não", async () => {
        const { gestora, ana, projeto } = await cenario();

        const paraAna = await criar(projeto.id, authorization(gestora), { title: "Rever o design", assigneeId: ana.id });
        await criar(projeto.id, authorization(ana), { title: "Minha", assigneeId: ana.id });

        expect(await enviadas("task.assigned")).toEqual([{
            recipientId: ana.id,
            data: { taskId: paraAna.body.data.id, taskTitle: "Rever o design", projectId: projeto.id, projectName: "Portal" },
        }]);
    });

    it("o responsável tem de estar no projeto: um admin da empresa serve, fora disso é 400", async () => {
        const { admin, gestora, sara, projeto } = await cenario();
        const { user: deFora } = await createActor(UserRole.Employee);
        const suspensa = await criarUtilizador({ companyId: admin.companyId, status: UserStatus.Suspended, password: "Password1!" });
        await criarAlocacao(suspensa.id, projeto.id);

        expect((await criar(projeto.id, authorization(gestora), { title: "A", assigneeId: admin.id })).status).toBe(201);
        expect((await criar(projeto.id, authorization(gestora), { title: "B", assigneeId: gestora.id })).status).toBe(201);

        for (const assigneeId of [sara.id, deFora.id, suspensa.id, "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42"]) {
            const res = await criar(projeto.id, authorization(gestora), { title: "C", assigneeId });

            expect(res.status).toBe(400);
            expect(res.body.data).toEqual([{ field: "assigneeId", message: "Tem de estar no projeto" }]);
        }
    });

    it("alguém fora do projeto não cria", async () => {
        const { sara, projeto } = await cenario();

        expect((await criar(projeto.id, authorization(sara), { title: "A" })).status).toBe(403);
        expect(await tarefas().countBy({ projectId: projeto.id })).toBe(0);
    });
});

describe("PATCH /projects/:id/tasks/:taskId", () => {
    it("qualquer membro altera o conteúdo: junta, um null limpa, e as etiquetas substituem", async () => {
        const { ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { assigneeId: ana.id, labels: ["bug"] });

        const res = await alterar(projeto.id, tarefa.id, authorization(rui), {
            description: "Passos para reproduzir",
            dueDate: "2026-12-01",
            priority: "HIGH",
            labels: ["api"],
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            title: tarefa.title,
            description: "Passos para reproduzir",
            dueDate: "2026-12-01",
            priority: TaskPriority.High,
            labels: ["api"],
            assigneeId: ana.id,
        });

        const limpa = await alterar(projeto.id, tarefa.id, authorization(rui), { description: null, assigneeId: null });

        expect(limpa.body.data).toMatchObject({ description: null, assigneeId: null });
        expect(eventsSentToUsers("project_task").map(([, e]) => (e as { action: string }).action)).toEqual(["updated", "updated"]);
    });

    it("um responsável novo recebe task.assigned; o mesmo outra vez, não", async () => {
        const { gestora, ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, gestora.id, { assigneeId: ana.id });

        await alterar(projeto.id, tarefa.id, authorization(gestora), { assigneeId: rui.id });
        await alterar(projeto.id, tarefa.id, authorization(gestora), { assigneeId: rui.id, title: "Outro título" });

        expect((await enviadas("task.assigned")).map((n) => n.recipientId)).toEqual([rui.id]);
    });

    it("não muda a coluna nem a posição, e um corpo vazio é 400", async () => {
        const { ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);

        const comStatus = await alterar(projeto.id, tarefa.id, authorization(ana), { status: "done", position: 0 });

        expect(comStatus.status).toBe(400);
        expect((await tarefas().findOneByOrFail({ id: tarefa.id })).status).toBe(TaskStatus.Todo);
    });

    it("uma tarefa de outro projeto é 404", async () => {
        const { admin, ana, projeto } = await cenario();
        const alheia = await criarTarefa((await criarProjeto(admin.companyId)).id, admin.id);

        const res = await alterar(projeto.id, alheia.id, authorization(ana), { title: "Minha" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Tarefa não encontrada");
    });
});

describe("DELETE /projects/:id/tasks/:taskId", () => {
    it("só quem a criou, a gestora ou um admin apagam; vai em direto", async () => {
        const { adminHeader, gestora, ana, rui, projeto } = await cenario();
        const [a, b, c] = [
            await criarTarefa(projeto.id, ana.id, { assigneeId: rui.id }),
            await criarTarefa(projeto.id, ana.id),
            await criarTarefa(projeto.id, ana.id),
        ];
        const caminho = (id: string) => `/projects/${projeto.id}/tasks/${id}`;

        const doRui = await apagar(caminho(a!.id), authorization(rui));

        expect(doRui.status).toBe(403);
        expect(doRui.body.message).toBe("Só quem criou a tarefa, o gestor do projeto ou um admin a apaga");
        expect((await apagar(caminho(a!.id), authorization(ana))).status).toBe(200);
        expect((await apagar(caminho(b!.id), authorization(gestora))).status).toBe(200);
        expect((await apagar(caminho(c!.id), adminHeader)).status).toBe(200);
        expect(await tarefas().countBy({ projectId: projeto.id })).toBe(0);
        expect(eventsSentToUsers("project_task")[0]?.[1]).toEqual({ action: "deleted", projectId: projeto.id, id: a!.id });
    });

    it("leva os anexos, do disco também, e os comentários", async () => {
        const { ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        await anexar(projeto.id, tarefa.id, authorization(ana), pdf());
        await criarComentario(tarefa.id, rui.id);

        const res = await apagar(`/projects/${projeto.id}/tasks/${tarefa.id}`, authorization(ana));

        expect(res.status).toBe(200);
        expect(await ficheiros().countBy({ ownerId: tarefa.id })).toBe(0);
        expect(await noDisco()).toEqual([]);
    });
});

describe("Anexos de uma tarefa", () => {
    it("qualquer membro anexa; o cartão mostra-o e o quadro recebe o cartão novo", async () => {
        const { admin, ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id, { assigneeId: ana.id });

        const res = await anexar(projeto.id, tarefa.id, authorization(rui), await png(), "ecra.png");

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ kind: FileKind.TaskAttachment, name: "ecra.png", uploadedBy: rui.id });
        expect(await noDisco()).toEqual([`${admin.companyId}/task_attachment/${res.body.data.id}.png`]);

        const cartao = await ler(`/projects/${projeto.id}/tasks/${tarefa.id}`, authorization(ana));
        expect(cartao.body.data.attachments).toEqual([res.body.data]);

        const [evento] = eventsSentToUsers("project_task");
        expect(evento?.[1]).toMatchObject({ action: "updated", task: { id: tarefa.id, attachments: [res.body.data] } });
    });

    it("até 5: o sexto é 409; o tipo vê-se pelos bytes", async () => {
        const { ana, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);

        for (let i = 0; i < 5; i++) {
            expect((await anexar(projeto.id, tarefa.id, authorization(ana), pdf(`anexo ${i}`))).status).toBe(201);
        }

        expect((await anexar(projeto.id, tarefa.id, authorization(ana), pdf("sexto"))).status).toBe(409);
        expect((await anexar(projeto.id, tarefa.id, authorization(ana), Buffer.from("<html></html>"))).status).toBe(400);
    });

    it("alguém fora do projeto não anexa", async () => {
        const { ana, sara, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);

        expect((await anexar(projeto.id, tarefa.id, authorization(sara), pdf())).status).toBe(403);
        expect(await noDisco()).toEqual([]);
    });

    it("tirar um anexo atualiza o cartão em direto; o de outra tarefa é 404", async () => {
        const { ana, rui, projeto } = await cenario();
        const tarefa = await criarTarefa(projeto.id, ana.id);
        const outra = await criarTarefa(projeto.id, ana.id);
        const anexo = await anexar(projeto.id, tarefa.id, authorization(ana), pdf());
        const caminho = (tarefaId: string) => `/projects/${projeto.id}/tasks/${tarefaId}/attachments/${anexo.body.data.id}`;

        expect((await apagar(caminho(outra.id), authorization(rui))).status).toBe(404);

        const res = await apagar(caminho(tarefa.id), authorization(rui));

        expect(res.status).toBe(200);
        expect(await noDisco()).toEqual([]);
        expect(eventsSentToUsers("project_task").at(-1)?.[1]).toMatchObject({
            action: "updated",
            task: { id: tarefa.id, attachments: [] },
        });
    });
});
