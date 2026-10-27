import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarDespesa,
    criarProjeto,
    criarSalario,
    criarUtilizador,
} from "../helpers/factories.js";
import { repo } from "../setup/db.js";

/** Os avisos de orçamento de uma pessoa: só o limiar, por ordem de criação. */
const avisos = async (userId: string) =>
    (await repo(Notification).find({
        where: { recipientId: userId, type: "project.budget_threshold" },
        order: { id: "ASC" },
    })).map((notification) => notification.data.threshold);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const registar = (header: string, corpo: object) =>
    request(app).post("/expenses").set("Authorization", header).send(corpo);

/** Dois company_admins e a gestora (employee) de um projeto com 1000 de orçamento. */
const cenario = async (budget: string | null = "1000.00") => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const colegaAdmin = await ativo(admin.companyId, UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id, budget });

    return { admin, header, colegaAdmin, gestora, projeto };
};

const despesa = (projectId: string, amount: string) =>
    ({ projectId, amount, title: "Servidor", category: "hardware", incurredOn: "2025-06-01" });

describe("avisos de orçamento", () => {
    it("passar os 80% avisa os admins e o gestor, mas não quem registou", async () => {
        const { admin, header, colegaAdmin, gestora, projeto } = await cenario();

        const res = await registar(header, despesa(projeto.id, "850.00"));

        expect(res.status).toBe(201);
        expect(await avisos(colegaAdmin.id)).toEqual([80]);
        expect(await avisos(gestora.id)).toEqual([80]);
        expect(await avisos(admin.id)).toEqual([]);

        const [aviso] = await repo(Notification).find({ where: { recipientId: gestora.id } });
        expect(aviso?.data).toEqual({ projectId: projeto.id, projectName: "Portal", threshold: 80 });
    });

    it("não repete enquanto não passar o seguinte, e de uma vez só avisa o mais alto", async () => {
        const { header, colegaAdmin, projeto } = await cenario();

        await registar(header, despesa(projeto.id, "500.00"));
        await registar(header, despesa(projeto.id, "350.00"));
        await registar(header, despesa(projeto.id, "50.00"));
        await registar(header, despesa(projeto.id, "300.00"));

        expect(await avisos(colegaAdmin.id)).toEqual([80, 100]);
    });

    it("de baixo direto para cima dos 100% só avisa os 100%", async () => {
        const { header, colegaAdmin, projeto } = await cenario();

        await registar(header, despesa(projeto.id, "1200.00"));

        expect(await avisos(colegaAdmin.id)).toEqual([100]);
    });

    it("os admins contam com as pessoas; o gestor só com as despesas", async () => {
        const { admin, header, colegaAdmin, gestora, projeto } = await cenario("2000.00");
        const ana = await ativo(admin.companyId);
        // 1000 × 1,44375 num mês inteiro: 1443,75 (72%) só em pessoas.
        await criarSalario(ana.id, admin.id, { amount: "1000.00", effectiveFrom: "2025-01-01" });
        await criarAlocacao(ana.id, projeto.id, { allocationPercent: 100, startDate: "2025-01-01", endDate: "2025-01-31" });

        await registar(header, despesa(projeto.id, "200.00"));

        expect(await avisos(colegaAdmin.id)).toEqual([80]);
        expect(await avisos(gestora.id)).toEqual([]);
    });

    it("o gestor que é admin recebe um aviso só, o dos admins", async () => {
        const { admin, header, colegaAdmin } = await cenario();
        const projeto = await criarProjeto(admin.companyId, "Intranet", { managerId: colegaAdmin.id, budget: "1000.00" });

        await registar(header, despesa(projeto.id, "900.00"));

        expect(await avisos(colegaAdmin.id)).toEqual([80]);
    });

    it("subir o montante num PATCH também avisa", async () => {
        const { admin, colegaAdmin, gestora, projeto } = await cenario();
        const existente = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id, amount: "500.00" });

        const res = await request(app)
            .patch(`/expenses/${existente.id}`)
            .set("Authorization", authorization(gestora))
            .send({ amount: "820.00" });

        expect(res.status).toBe(200);
        expect(await avisos(colegaAdmin.id)).toEqual([80]);
        expect(await avisos(gestora.id)).toEqual([]);
    });

    it("baixar o orçamento abaixo do que já se gastou avisa", async () => {
        const { admin, header, colegaAdmin, gestora, projeto } = await cenario();
        await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id, amount: "500.00" });

        const res = await request(app).patch(`/projects/${projeto.id}`).set("Authorization", header)
            .send({ budget: "600.00" });

        expect(res.status).toBe(200);
        expect(await avisos(colegaAdmin.id)).toEqual([80]);
        expect(await avisos(gestora.id)).toEqual([80]);
    });

    it("dar um orçamento a um projeto que já o passaria avisa, e sem orçamento nunca", async () => {
        const { admin, header, colegaAdmin, projeto } = await cenario(null);

        await registar(header, despesa(projeto.id, "900.00"));
        expect(await avisos(colegaAdmin.id)).toEqual([]);

        await request(app).patch(`/projects/${projeto.id}`).set("Authorization", header).send({ budget: "1000.00" });

        expect(await avisos(colegaAdmin.id)).toEqual([80]);
        expect(await avisos(admin.id)).toEqual([]);
    });
});
