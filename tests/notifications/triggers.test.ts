import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { ProjectStatus, ReviewRequestStatus, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { errorSpy } from "../helpers/console-spy.js";
import {
    criarAlocacao,
    criarCiclo,
    criarPedido,
    criarProjeto,
    criarUtilizador,
} from "../helpers/factories.js";
import { disconnectUserSpy, eventsSentToUsers, sendToUsersSpy } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const notificacoes = () => repo(Notification);

/** As notificações de uma pessoa, só tipo e dados, por ordem de criação. */
const recebidas = async (userId: string) =>
    (await notificacoes().find({ where: { recipientId: userId }, order: { id: "ASC" } }))
        .map(({ type, data }) => ({ type, data }));

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const enviar = (metodo: "post" | "patch" | "delete", caminho: string, header: string, corpo?: object) =>
    request(app)[metodo](caminho).set("Authorization", header).send(corpo);

/** Um company_admin, uma employee e um projeto da empresa. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Website");

    return { admin, header, ana, projeto };
};

describe("alocações", () => {
    it("alocar notifica a pessoa, e o evento sai pelo hub", async () => {
        const { admin, header, ana, projeto } = await cenario();

        const res = await enviar("post", "/allocations", header, {
            userId: ana.id,
            projectId: projeto.id,
            allocationPercent: 60,
            roleOnProject: "Backend",
            startDate: "2026-01-01",
        });

        expect(res.status).toBe(201);
        expect(await recebidas(ana.id)).toEqual([{
            type: "allocation.created",
            data: {
                allocationId: res.body.data.id,
                projectId: projeto.id,
                projectName: "Website",
                allocationPercent: 60,
                roleOnProject: "Backend",
                startDate: "2026-01-01",
                endDate: null,
            },
        }]);
        expect(await recebidas(admin.id)).toEqual([]);

        const enviados = eventsSentToUsers("notification");
        expect(enviados).toHaveLength(1);
        const [destinatarios, evento] = enviados[0]!;
        expect(destinatarios).toEqual([ana.id]);
        expect(evento).toMatchObject({ message: "Tens uma nova alocação no projeto Website (60%)" });
    });

    it("registar uma alocação que já acabou não notifica ninguém", async () => {
        const { header, ana, projeto } = await cenario();

        const res = await enviar("post", "/allocations", header, {
            userId: ana.id,
            projectId: projeto.id,
            allocationPercent: 50,
            startDate: "2020-01-01",
            endDate: "2020-06-30",
        });

        expect(res.status).toBe(201);
        expect(await recebidas(ana.id)).toEqual([]);
        expect(sendToUsersSpy).not.toHaveBeenCalled();
    });

    it("fechar notifica allocation.ended, mesmo que mude mais alguma coisa no mesmo pedido", async () => {
        const { header, ana, projeto } = await cenario();
        const alocacao = await criarAlocacao(ana.id, projeto.id);

        await enviar("patch", `/allocations/${alocacao.id}`, header, { endDate: "2026-12-31", allocationPercent: 20 });

        expect(await recebidas(ana.id)).toEqual([{
            type: "allocation.ended",
            data: { allocationId: alocacao.id, projectId: projeto.id, projectName: "Website", endDate: "2026-12-31" },
        }]);
    });

    it("alterar notifica allocation.updated com o que mudou, e um PATCH que não muda nada não notifica", async () => {
        const { header, ana, projeto } = await cenario();
        const alocacao = await criarAlocacao(ana.id, projeto.id, { allocationPercent: 50 });

        await enviar("patch", `/allocations/${alocacao.id}`, header, { allocationPercent: 50 });
        await enviar("patch", `/allocations/${alocacao.id}`, header, { allocationPercent: 80, roleOnProject: "QA" });

        expect(await recebidas(ana.id)).toEqual([{
            type: "allocation.updated",
            data: {
                allocationId: alocacao.id,
                projectId: projeto.id,
                projectName: "Website",
                allocationPercent: 80,
                roleOnProject: "QA",
                endDate: null,
                changes: ["allocationPercent", "roleOnProject"],
            },
        }]);
    });

    it("apagar é corrigir um erro: não notifica ninguém", async () => {
        const { header, ana, projeto } = await cenario();
        const alocacao = await criarAlocacao(ana.id, projeto.id);

        const res = await enviar("delete", `/allocations/${alocacao.id}`, header);

        expect(res.status).toBe(200);
        expect(await recebidas(ana.id)).toEqual([]);
    });
});

describe("projetos", () => {
    it("criar com gestor notifica o gestor", async () => {
        const { header, ana } = await cenario();

        const res = await enviar("post", "/projects", header, { name: "Intranet", managerId: ana.id });

        expect(await recebidas(ana.id)).toEqual([{
            type: "project.manager_assigned",
            data: { projectId: res.body.data.id, projectName: "Intranet" },
        }]);
    });

    it("mudar o estado notifica quem está no projeto e o gestor, mas não quem já saiu nem quem mudou", async () => {
        const { admin, header, ana, projeto } = await cenario();
        const rui = await ativo(admin.companyId);
        const saiu = await ativo(admin.companyId);
        const gestor = await ativo(admin.companyId);
        await criarAlocacao(ana.id, projeto.id);
        await criarAlocacao(rui.id, projeto.id, { endDate: "2999-12-31" });
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2020-01-01", endDate: "2020-12-31" });
        await criarAlocacao(admin.id, projeto.id);
        await enviar("patch", `/projects/${projeto.id}`, header, { managerId: gestor.id });

        await enviar("patch", `/projects/${projeto.id}`, header, { status: ProjectStatus.Completed });

        const estado = {
            type: "project.status_changed",
            data: { projectId: projeto.id, projectName: "Website", from: "active", to: "completed" },
        };
        expect(await recebidas(ana.id)).toEqual([estado]);
        expect(await recebidas(rui.id)).toEqual([estado]);
        expect(await recebidas(gestor.id)).toEqual([
            { type: "project.manager_assigned", data: { projectId: projeto.id, projectName: "Website" } },
            estado,
        ]);
        expect(await recebidas(saiu.id)).toEqual([]);
        expect(await recebidas(admin.id)).toEqual([]);
    });

    it("um PATCH que não mexe no gestor nem no estado não notifica", async () => {
        const { header, ana, projeto } = await cenario();
        await criarAlocacao(ana.id, projeto.id);

        await enviar("patch", `/projects/${projeto.id}`, header, { clientName: "Câmara", status: ProjectStatus.Active });

        expect(await recebidas(ana.id)).toEqual([]);
    });
});

describe("avaliações", () => {
    it("abrir um ciclo notifica cada avaliador uma vez", async () => {
        const { admin, header, ana, projeto } = await cenario();
        const rui = await ativo(admin.companyId);
        const eva = await ativo(admin.companyId);
        for (const pessoa of [ana, rui, eva]) {
            await criarAlocacao(pessoa.id, projeto.id, { startDate: "2020-01-01" });
        }

        const res = await enviar("post", "/review-cycles", header, { name: "Q4", deadline: "2999-12-31" });

        const aberto = { type: "review_cycle.opened", data: { cycleId: res.body.data.id, cycleName: "Q4", deadline: "2999-12-31" } };
        for (const pessoa of [ana, rui, eva]) {
            expect(await recebidas(pessoa.id)).toEqual([aberto]);
        }
    });

    it("fechar um ciclo notifica só quem tinha pedidos por responder", async () => {
        const { admin, header, ana } = await cenario();
        const rui = await ativo(admin.companyId);
        const ciclo = await criarCiclo(admin.companyId, admin.id, { name: "Q3" });
        await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });
        await criarPedido(rui, ana.id, admin.id, { cycleId: ciclo.id, status: ReviewRequestStatus.Submitted });

        const res = await enviar("post", `/review-cycles/${ciclo.id}/close`, header);

        expect(res.status).toBe(200);
        expect(await recebidas(ana.id)).toEqual([
            { type: "review_cycle.closed", data: { cycleId: ciclo.id, cycleName: "Q3" } },
        ]);
        expect(await recebidas(rui.id)).toEqual([]);
    });

    it("um pedido ad-hoc notifica quem vai avaliar", async () => {
        const { admin, header, ana } = await cenario();
        const rui = await ativo(admin.companyId);

        const res = await enviar("post", "/review-requests", header, {
            reviewerId: ana.id,
            revieweeId: rui.id,
            dueDate: "2999-01-01",
        });

        expect(await recebidas(ana.id)).toEqual([{
            type: "review_request.created",
            data: { requestId: res.body.data.id, revieweeId: rui.id, dueDate: "2999-01-01" },
        }]);
        expect(await recebidas(rui.id)).toEqual([]);
    });

    it("submeter um ad-hoc diz a quem pediu só quem foi avaliado, e nunca ao avaliado", async () => {
        const { admin, ana } = await cenario();
        const rui = await ativo(admin.companyId);
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const res = await enviar("post", `/review-requests/${pedido.id}/review`, authorization(ana), {
            recommendsRaise: true,
            performanceScore: 5,
            comments: "Excelente",
        });

        expect(res.status).toBe(201);
        // Exatamente isto: nem o pedido, nem quem avaliou, nem o conteúdo.
        expect(await recebidas(admin.id)).toEqual([{ type: "review.submitted", data: { revieweeId: rui.id } }]);
        expect(await recebidas(rui.id)).toEqual([]);
    });

    it("um admin que pediu uma avaliação sobre si próprio não é notificado dela", async () => {
        const { admin, ana } = await cenario();
        const pedido = await criarPedido(ana, admin.id, admin.id);

        await enviar("post", `/review-requests/${pedido.id}/review`, authorization(ana), { recommendsRaise: false });

        expect(await recebidas(admin.id)).toEqual([]);
    });

    it("submeter ou recusar num ciclo não notifica quem o abriu", async () => {
        const { admin, ana } = await cenario();
        const rui = await ativo(admin.companyId);
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        const submeter = await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });
        const recusar = await criarPedido(rui, ana.id, admin.id, { cycleId: ciclo.id });

        await enviar("post", `/review-requests/${submeter.id}/review`, authorization(ana), { recommendsRaise: true });
        await enviar("post", `/review-requests/${recusar.id}/decline`, authorization(rui));

        expect(await recebidas(admin.id)).toEqual([]);
    });

    it("recusar um ad-hoc notifica quem pediu", async () => {
        const { admin, ana } = await cenario();
        const rui = await ativo(admin.companyId);
        const pedido = await criarPedido(ana, rui.id, admin.id);

        await enviar("post", `/review-requests/${pedido.id}/decline`, authorization(ana));

        expect(await recebidas(admin.id)).toEqual([{
            type: "review_request.declined",
            data: { requestId: pedido.id, reviewerId: ana.id, revieweeId: rui.id },
        }]);
        expect(await recebidas(rui.id)).toEqual([]);
    });
});

describe("contas", () => {
    it("ativar uma conta notifica os company_admin ativos da empresa, e não os system_admins", async () => {
        const { user: admin } = await createActor(UserRole.CompanyAdmin);
        const { user: sysadmin } = await createActor(UserRole.SystemAdmin);
        const suspenso = await criarUtilizador({
            companyId: admin.companyId,
            role: UserRole.CompanyAdmin,
            status: UserStatus.Suspended,
            password: "Password1!",
        });
        const signupToken = randomUUID();
        const convidado = await criarUtilizador({
            companyId: admin.companyId,
            email: "nova@empresa.pt",
            signupToken,
            signupTokenExpiresAt: new Date(Date.now() + 60_000),
        });

        const res = await request(app).post("/auth/account/activate").send({ signupToken, password: "Password1!" });

        expect(res.status).toBe(200);
        expect(await recebidas(admin.id)).toEqual([{
            type: "user.activated",
            data: { userId: convidado.id, email: "nova@empresa.pt" },
        }]);
        expect(await recebidas(suspenso.id)).toEqual([]);
        expect(await recebidas(convidado.id)).toEqual([]);
        expect(await recebidas(sysadmin.id)).toEqual([]);
    });

    it("o primeiro company_admin a ativar a conta avisa os system_admins ativos", async () => {
        const { user: sysadmin } = await createActor(UserRole.SystemAdmin);
        const suspenso = await criarUtilizador({
            companyId: sysadmin.companyId,
            role: UserRole.SystemAdmin,
            status: UserStatus.Suspended,
            password: "Password1!",
        });
        const signupToken = randomUUID();
        const gestora = await criarUtilizador({
            role: UserRole.CompanyAdmin,
            email: "gestora@empresa.pt",
            signupToken,
            signupTokenExpiresAt: new Date(Date.now() + 60_000),
        });

        const res = await request(app).post("/auth/account/activate").send({ signupToken, password: "Password1!" });

        expect(res.status).toBe(200);
        expect(await recebidas(sysadmin.id)).toEqual([{
            type: "user.activated",
            data: { userId: gestora.id, email: "gestora@empresa.pt" },
        }]);
        // A empresa onde aconteceu, e não a do system_admin.
        expect((await notificacoes().findOneByOrFail({ recipientId: sysadmin.id })).companyId).toBe(gestora.companyId);
        expect(await recebidas(suspenso.id)).toEqual([]);
        expect(await recebidas(gestora.id)).toEqual([]);
    });

    it("suspender uma conta corta-lhe o stream em direto", async () => {
        const { header, ana } = await cenario();

        await enviar("patch", `/users/${ana.id}/status`, header, { status: UserStatus.Suspended });

        expect(disconnectUserSpy).toHaveBeenCalledWith(ana.id, "account_inactive");
    });

    it("reativar uma conta não corta nada", async () => {
        const { admin, header } = await cenario();
        const suspensa = await criarUtilizador({
            companyId: admin.companyId,
            status: UserStatus.Suspended,
            password: "Password1!",
        });

        await enviar("patch", `/users/${suspensa.id}/status`, header, { status: UserStatus.Active });

        expect(disconnectUserSpy).not.toHaveBeenCalled();
    });
});

describe("falhas", () => {
    it("uma notificação que falha fica no log e não estraga o pedido", async () => {
        const { header, ana, projeto } = await cenario();
        sendToUsersSpy.mockImplementationOnce(() => {
            throw new Error("hub em baixo");
        });

        const res = await enviar("post", "/allocations", header, {
            userId: ana.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(res.status).toBe(201);
        expect(errorSpy).toHaveBeenCalledWith("Falha ao criar a notificação allocation.created", expect.any(Error));
        // A linha já estava gravada: quem estiver offline continua a vê-la.
        expect(await recebidas(ana.id)).toHaveLength(1);
    });
});
