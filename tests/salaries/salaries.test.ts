import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Salary } from "../../src/entities/Salary.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { isoDate } from "../../src/utils/dates.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarEmpresa, criarSalario, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const salarios = () => repo(Salary);

const historico = (userId: string) =>
    salarios().find({ where: { userId }, order: { effectiveFrom: "ASC" } });

const definir = (userId: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).post(`/users/${userId}/salaries`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

/** Um employee ativo na empresa de um company_admin. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const pessoa = await criarUtilizador({
        companyId: admin.companyId,
        password: "Password1!",
        status: UserStatus.Active,
        mustChangePassword: false,
    });

    return { admin, header, pessoa };
};

describe("POST /users/:id/salaries", () => {
    it("define o primeiro salário", async () => {
        const { admin, header, pessoa } = await cenario();

        const res = await definir(pessoa.id, header, {
            amount: 2150,
            effectiveFrom: "2026-01-01",
            reason: "Contratação",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Salário definido" });
        expect(res.body.data).toMatchObject({
            userId: pessoa.id,
            amount: "2150.00",
            currency: "EUR",
            effectiveFrom: "2026-01-01",
            effectiveTo: null,
            reason: "Contratação",
            createdBy: admin.id,
        });
    });

    it("fecha o salário aberto no dia em que o novo começa", async () => {
        const { admin, header, pessoa } = await cenario();
        const antigo = await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        const res = await definir(pessoa.id, header, { amount: "1800.5", effectiveFrom: "2026-03-01" });

        expect(res.status).toBe(201);
        expect(res.body.data.amount).toBe("1800.50");
        expect(await historico(pessoa.id)).toEqual([
            expect.objectContaining({ id: antigo.id, effectiveTo: "2026-03-01" }),
            expect.objectContaining({ id: res.body.data.id, effectiveTo: null }),
        ]);
    });

    it("o effectiveFrom por omissão é hoje, e a moeda passa a maiúsculas", async () => {
        const { header, pessoa } = await cenario();

        const res = await definir(pessoa.id, header, { amount: 1000, currency: "usd" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ effectiveFrom: isoDate(), currency: "USD" });
    });

    it.each([
        ["no mesmo dia", "2025-01-01"],
        ["antes", "2024-06-01"],
    ])("recusa um salário que começa %s do mais recente", async (_titulo, effectiveFrom) => {
        const { admin, header, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        const res = await definir(pessoa.id, header, { amount: 3000, effectiveFrom });

        expect(res.status).toBe(409);
        expect(await historico(pessoa.id)).toEqual([
            expect.objectContaining({ effectiveFrom: "2025-01-01", effectiveTo: null }),
        ]);
    });

    it("ninguém define o seu próprio salário, nem um system_admin", async () => {
        const { user, header } = await createActor(UserRole.SystemAdmin);

        const res = await definir(user.id, header, { amount: 99999 });

        expect(res.status).toBe(403);
        expect(await historico(user.id)).toEqual([]);
    });

    it("um company_admin não define o de outro company_admin", async () => {
        const { admin, header } = await cenario();
        const colega = await criarUtilizador({ companyId: admin.companyId, role: UserRole.CompanyAdmin });

        const res = await definir(colega.id, header, { amount: 3000 });

        expect(res.status).toBe(403);
    });

    it("um system_admin define o de um company_admin de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const admin = await criarUtilizador({ companyId: (await criarEmpresa()).id, role: UserRole.CompanyAdmin });

        const res = await definir(admin.id, header, { amount: 4000 });

        expect(res.status).toBe(201);
    });

    it("recusa a um employee", async () => {
        const { user: actor, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({ companyId: actor.companyId });

        const res = await definir(colega.id, header, { amount: 3000 });

        expect(res.status).toBe(403);
    });

    it("responde o mesmo a uma pessoa de outra empresa e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const alheia = await criarUtilizador();

        const foraDeAlcance = await definir(alheia.id, header, { amount: 3000 });
        const inexistente = await definir(randomUUID(), header, { amount: 3000 });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });

    it("devolve 401 sem token", async () => {
        const res = await definir(randomUUID(), undefined, { amount: 3000 });

        expect(res.status).toBe(401);
    });

    it.each([
        ["sem montante", {}, "amount"],
        ["um montante negativo", { amount: -1 }, "amount"],
        ["3 casas decimais", { amount: "10.123" }, "amount"],
        ["11 dígitos inteiros", { amount: "12345678901" }, "amount"],
        ["uma moeda com 2 letras", { amount: 10, currency: "EU" }, "currency"],
        ["uma data com formato português", { amount: 10, effectiveFrom: "01/03/2026" }, "effectiveFrom"],
        ["um motivo vazio", { amount: 10, reason: "" }, "reason"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { header, pessoa } = await cenario();

        const res = await definir(pessoa.id, header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("GET /users/:id/salaries", () => {
    it("devolve o histórico do mais recente para o mais antigo", async () => {
        const { admin, header, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2024-01-01", effectiveTo: "2025-01-01" });
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        const res = await ler(`/users/${pessoa.id}/salaries`, header);

        expect(res.status).toBe(200);
        expect(res.body.data.map((s: { effectiveFrom: string }) => s.effectiveFrom))
            .toEqual(["2025-01-01", "2024-01-01"]);
    });

    it("a própria pessoa lê o seu histórico", async () => {
        const { admin, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id);

        const res = await ler(`/users/${pessoa.id}/salaries`, authorization(pessoa));

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    it("um colega recebe 403", async () => {
        const { admin, pessoa } = await cenario();
        const { header } = await createActor(UserRole.Employee, admin.companyId);

        const res = await ler(`/users/${pessoa.id}/salaries`, header);

        expect(res.status).toBe(403);
    });

    it("um company_admin não lê o de outro company_admin", async () => {
        const { admin } = await cenario();
        const { header } = await createActor(UserRole.CompanyAdmin, admin.companyId);

        const res = await ler(`/users/${admin.id}/salaries`, header);

        expect(res.status).toBe(403);
    });

    it("devolve 404 a uma pessoa de outra empresa", async () => {
        const { header } = await cenario();
        const alheia = await criarUtilizador();

        const res = await ler(`/users/${alheia.id}/salaries`, header);

        expect(res.status).toBe(404);
    });
});

describe("GET /users/:id/salaries/current", () => {
    it("devolve o que está em vigor hoje, e não um aumento agendado", async () => {
        const { admin, header, pessoa } = await cenario();
        const atual = await criarSalario(pessoa.id, admin.id, {
            amount: "1500.00",
            effectiveFrom: "2025-01-01",
            effectiveTo: "2999-01-01",
        });
        await criarSalario(pessoa.id, admin.id, { amount: "1700.00", effectiveFrom: "2999-01-01" });

        const res = await ler(`/users/${pessoa.id}/salaries/current`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ id: atual.id, amount: "1500.00" });
    });

    it("devolve o salário aberto quando não há nada agendado", async () => {
        const { admin, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2024-01-01", effectiveTo: "2025-01-01" });
        const aberto = await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        const res = await ler(`/users/${pessoa.id}/salaries/current`, authorization(pessoa));

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(aberto.id);
    });

    it("devolve 404 a quem ainda não tem salário em vigor", async () => {
        const { admin, header, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2999-01-01" });

        const res = await ler(`/users/${pessoa.id}/salaries/current`, header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Esta pessoa não tem salário em vigor");
    });

    it("um colega recebe 403", async () => {
        const { admin, pessoa } = await cenario();
        const { header } = await createActor(UserRole.Employee, admin.companyId);

        const res = await ler(`/users/${pessoa.id}/salaries/current`, header);

        expect(res.status).toBe(403);
    });
});

describe("DELETE /users/:id/salaries/:salaryId", () => {
    const apagar = (userId: string, salaryId: string, header: string) =>
        request(app).delete(`/users/${userId}/salaries/${salaryId}`).set("Authorization", header);

    it("apaga o mais recente e reabre o anterior", async () => {
        const { admin, header, pessoa } = await cenario();
        const anterior = await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });
        const novo = await definir(pessoa.id, header, { amount: 9999, effectiveFrom: "2026-01-01" });

        const res = await apagar(pessoa.id, novo.body.data.id, header);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Salário apagado");
        expect(await historico(pessoa.id)).toEqual([
            expect.objectContaining({ id: anterior.id, effectiveTo: null }),
        ]);
    });

    it("não reabre um anterior que não foi fechado por este", async () => {
        const { admin, header, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-01" });
        const ultimo = await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        await apagar(pessoa.id, ultimo.id, header).expect(200);

        expect(await historico(pessoa.id)).toEqual([
            expect.objectContaining({ effectiveTo: "2024-06-01" }),
        ]);
    });

    it("recusa apagar um salário a meio do histórico", async () => {
        const { admin, header, pessoa } = await cenario();
        const antigo = await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2024-01-01", effectiveTo: "2025-01-01" });
        await criarSalario(pessoa.id, admin.id, { effectiveFrom: "2025-01-01" });

        const res = await apagar(pessoa.id, antigo.id, header);

        expect(res.status).toBe(409);
        expect(await historico(pessoa.id)).toHaveLength(2);
    });

    it("devolve 404 a um salário de outra pessoa", async () => {
        const { admin, header, pessoa } = await cenario();
        await criarSalario(pessoa.id, admin.id);
        const outra = await criarUtilizador({ companyId: admin.companyId });
        const alheio = await criarSalario(outra.id, admin.id);

        const res = await apagar(pessoa.id, alheio.id, header);

        expect(res.status).toBe(404);
        expect(await salarios().findOneBy({ id: alheio.id })).not.toBeNull();
    });

    it("ninguém apaga o seu próprio salário", async () => {
        const { admin } = await cenario();
        const { user: sysadmin, header } = await createActor(UserRole.SystemAdmin);
        const proprio = await criarSalario(sysadmin.id, admin.id);

        const res = await apagar(sysadmin.id, proprio.id, header);

        expect(res.status).toBe(403);
    });
});
