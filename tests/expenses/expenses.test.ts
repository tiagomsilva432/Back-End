import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Expense } from "../../src/entities/Expense.js";
import { ExpenseCategory, UserRole } from "../../src/types/enums.js";
import { addDays, isoDate } from "../../src/utils/dates.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarDespesa, criarEmpresa, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const despesas = () => repo(Expense);

const enviar = (metodo: "post" | "patch" | "delete", caminho: string, header: string | undefined, corpo?: object) => {
    const pedido = request(app)[metodo](caminho);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

/** Um company_admin, a gestora de um projeto (employee), e uma colega sem projeto. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const colega = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id });

    return { admin, header, gestora, colega, projeto };
};

const valida = { title: "Licenças JetBrains", amount: "1249.9", category: "software", incurredOn: "2026-01-15" };

describe("POST /expenses", () => {
    it("um admin regista uma despesa de projeto", async () => {
        const { admin, header, projeto } = await cenario();

        const res = await enviar("post", "/expenses", header, {
            ...valida,
            projectId: projeto.id,
            description: "Renovação anual",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Despesa registada" });
        expect(res.body.data).toMatchObject({
            companyId: admin.companyId,
            projectId: projeto.id,
            title: "Licenças JetBrains",
            description: "Renovação anual",
            amount: "1249.90",
            category: ExpenseCategory.Software,
            incurredOn: "2026-01-15",
            createdBy: admin.id,
        });
    });

    it("o gestor regista no seu projeto, e a data por omissão é hoje", async () => {
        const { gestora, projeto } = await cenario();

        const res = await enviar("post", "/expenses", authorization(gestora), {
            title: "Viagem ao cliente",
            amount: 80,
            category: "TRAVEL",
            projectId: projeto.id,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ incurredOn: isoDate(), category: ExpenseCategory.Travel, amount: "80.00" });
    });

    it("o gestor não regista noutro projeto, nem uma colega no projeto dele", async () => {
        const { admin, gestora, colega, projeto } = await cenario();
        const outro = await criarProjeto(admin.companyId, "Intranet");

        const noOutro = await enviar("post", "/expenses", authorization(gestora), { ...valida, projectId: outro.id });
        const daColega = await enviar("post", "/expenses", authorization(colega), { ...valida, projectId: projeto.id });

        expect(noOutro.status).toBe(403);
        expect(daColega.status).toBe(403);
        expect(await despesas().count()).toBe(0);
    });

    it("responde o mesmo a um projeto de outra empresa e a um que não existe", async () => {
        const { header } = await cenario();
        const alheio = await criarProjeto((await criarEmpresa()).id);

        const foraDeAlcance = await enviar("post", "/expenses", header, { ...valida, projectId: alheio.id });
        const inexistente = await enviar("post", "/expenses", header, { ...valida, projectId: randomUUID() });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });

    it("um admin regista uma despesa da empresa, sem projeto", async () => {
        const { admin, header } = await cenario();

        const res = await enviar("post", "/expenses", header, { ...valida, category: "office", title: "Renda" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ companyId: admin.companyId, projectId: null });
    });

    it("o gestor de um projeto não regista despesas da empresa", async () => {
        const { gestora } = await cenario();

        const res = await enviar("post", "/expenses", authorization(gestora), valida);

        expect(res.status).toBe(403);
    });

    it("um system_admin indica a empresa de uma despesa da empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();

        const semEmpresa = await enviar("post", "/expenses", header, valida);
        const comEmpresa = await enviar("post", "/expenses", header, { ...valida, companyId: empresa.id });

        expect(semEmpresa.status).toBe(400);
        expect(semEmpresa.body.data).toEqual([expect.objectContaining({ field: "companyId" })]);
        expect(comEmpresa.status).toBe(201);
        expect(comEmpresa.body.data.companyId).toBe(empresa.id);
    });

    it("um company_admin não regista noutra empresa", async () => {
        const { header } = await cenario();

        const res = await enviar("post", "/expenses", header, { ...valida, companyId: (await criarEmpresa()).id });

        expect(res.status).toBe(403);
    });

    it("devolve 401 sem token", async () => {
        const res = await enviar("post", "/expenses", undefined, valida);

        expect(res.status).toBe(401);
    });

    it.each([
        ["um montante a zero", { amount: 0 }, "amount"],
        ["um montante negativo", { amount: -5 }, "amount"],
        ["3 casas decimais", { amount: "10.123" }, "amount"],
        ["sem título", { title: undefined }, "title"],
        ["uma categoria que não existe", { category: "comida" }, "category"],
        ["uma data futura", { incurredOn: addDays(isoDate(), 1) }, "incurredOn"],
        ["uma descrição vazia", { description: "" }, "description"],
        ["a empresa numa despesa de projeto", { projectId: randomUUID(), companyId: randomUUID() }, "companyId"],
    ])("devolve 400 com %s", async (_titulo, alteracao, field) => {
        const { header } = await cenario();

        const res = await enviar("post", "/expenses", header, { ...valida, ...alteracao });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("GET /expenses", () => {
    it("um admin vê as da empresa, da mais recente para a mais antiga, e filtra", async () => {
        const { admin, header, projeto } = await cenario();
        const renda = await criarDespesa(admin.companyId, admin.id, {
            category: ExpenseCategory.Office,
            incurredOn: "2025-03-01",
        });
        const viagem = await criarDespesa(admin.companyId, admin.id, {
            projectId: projeto.id,
            category: ExpenseCategory.Travel,
            incurredOn: "2025-05-10",
        });
        await criarDespesa((await criarEmpresa()).id, admin.id);

        const todas = await ler("/expenses", header);
        const daEmpresa = await ler("/expenses?overhead=true", header);
        const viagens = await ler("/expenses?category=travel", header);
        const deMaio = await ler("/expenses?from=2025-05-01&to=2025-05-31", header);

        expect(todas.status).toBe(200);
        expect(todas.body.data.map((e: { id: string }) => e.id)).toEqual([viagem.id, renda.id]);
        expect(daEmpresa.body.data.map((e: { id: string }) => e.id)).toEqual([renda.id]);
        expect(viagens.body.data.map((e: { id: string }) => e.id)).toEqual([viagem.id]);
        expect(deMaio.body.data.map((e: { id: string }) => e.id)).toEqual([viagem.id]);
    });

    it("o gestor só vê as do seu projeto, e tem de o indicar", async () => {
        const { admin, gestora, projeto } = await cenario();
        const outro = await criarProjeto(admin.companyId, "Intranet");
        const sua = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });
        await criarDespesa(admin.companyId, admin.id, { projectId: outro.id });
        await criarDespesa(admin.companyId, admin.id);

        const semProjeto = await ler("/expenses", authorization(gestora));
        const doSeu = await ler(`/expenses?projectId=${projeto.id}`, authorization(gestora));
        const doOutro = await ler(`/expenses?projectId=${outro.id}`, authorization(gestora));

        expect(semProjeto.status).toBe(403);
        expect(doSeu.status).toBe(200);
        expect(doSeu.body.data.map((e: { id: string }) => e.id)).toEqual([sua.id]);
        expect(doOutro.status).toBe(403);
    });

    it("um system_admin indica a empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await ler("/expenses", header);

        expect(res.status).toBe(400);
    });

    it("recusa um projeto com overhead=true", async () => {
        const { header, projeto } = await cenario();

        const res = await ler(`/expenses?projectId=${projeto.id}&overhead=true`, header);

        expect(res.status).toBe(400);
    });
});

describe("GET /expenses/:id", () => {
    it("o gestor lê uma do seu projeto; uma colega recebe 403", async () => {
        const { admin, gestora, colega, projeto } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });

        const daGestora = await ler(`/expenses/${despesa.id}`, authorization(gestora));
        const daColega = await ler(`/expenses/${despesa.id}`, authorization(colega));

        expect(daGestora.status).toBe(200);
        expect(daGestora.body.data.id).toBe(despesa.id);
        expect(daColega.status).toBe(403);
    });

    it("o gestor não lê uma despesa da empresa", async () => {
        const { admin, gestora } = await cenario();
        const renda = await criarDespesa(admin.companyId, admin.id);

        const res = await ler(`/expenses/${renda.id}`, authorization(gestora));

        expect(res.status).toBe(403);
    });

    it("responde o mesmo a uma de outra empresa e a uma que não existe", async () => {
        const { admin, header } = await cenario();
        const alheia = await criarDespesa((await criarEmpresa()).id, admin.id);

        const foraDeAlcance = await ler(`/expenses/${alheia.id}`, header);
        const inexistente = await ler(`/expenses/${randomUUID()}`, header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });
});

describe("PATCH /expenses/:id", () => {
    it("junta: muda o que vem, e um null limpa a descrição", async () => {
        const { admin, gestora, projeto } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id, {
            projectId: projeto.id,
            description: "Antes",
            amount: "50.00",
        });

        const res = await enviar("patch", `/expenses/${despesa.id}`, authorization(gestora), {
            amount: "75.5",
            description: null,
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ amount: "75.50", description: null, title: despesa.title });
        expect(await despesas().findOneBy({ id: despesa.id })).toMatchObject({ amount: "75.50", description: null });
    });

    it.each([
        ["um corpo vazio", {}],
        ["uma data futura", { incurredOn: addDays(isoDate(), 3) }],
    ])("devolve 400 com %s", async (_titulo, corpo) => {
        const { admin, header } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id);

        const res = await enviar("patch", `/expenses/${despesa.id}`, header, corpo);

        expect(res.status).toBe(400);
    });

    it("uma colega recebe 403", async () => {
        const { admin, colega, projeto } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });

        const res = await enviar("patch", `/expenses/${despesa.id}`, authorization(colega), { amount: 1 });

        expect(res.status).toBe(403);
    });
});

describe("DELETE /expenses/:id", () => {
    it("um admin apaga", async () => {
        const { admin, header } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id);

        const res = await enviar("delete", `/expenses/${despesa.id}`, header);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Despesa apagada");
        expect(await despesas().findOneBy({ id: despesa.id })).toBeNull();
    });

    it("uma colega recebe 403, e a despesa fica", async () => {
        const { admin, colega, projeto } = await cenario();
        const despesa = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });

        const res = await enviar("delete", `/expenses/${despesa.id}`, authorization(colega));

        expect(res.status).toBe(403);
        expect(await despesas().findOneBy({ id: despesa.id })).not.toBeNull();
    });
});
