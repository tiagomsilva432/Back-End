import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { ReviewCycle } from "../../src/entities/ReviewCycle.js";
import { ReviewRequest } from "../../src/entities/ReviewRequest.js";
import { ReviewRequestStatus, UserRole, UserStatus } from "../../src/types/enums.js";
import { isoDate, monthsAgo } from "../../src/utils/dates.js";
import { createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarAvaliacao,
    criarCiclo,
    criarEmpresa,
    criarPedido,
    criarProjeto,
    criarUtilizador,
} from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const ciclos = () => repo(ReviewCycle);
const pedidos = () => repo(ReviewRequest);

const ativo = (companyId: string, role = UserRole.Employee, status = UserStatus.Active) =>
    criarUtilizador({ companyId, role, status, password: "Password1!", mustChangePassword: false });

const abrir = (header: string, corpo: object) =>
    request(app).post("/review-cycles").set("Authorization", header).send(corpo);

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

/** Os pares gerados, como "reviewer->reviewee", ordenados para comparar. */
const paresDoCiclo = async (cycleId: string) =>
    (await pedidos().findBy({ cycleId })).map((p) => `${p.reviewerId}->${p.revieweeId}`).sort();

const par = (a: { id: string }, b: { id: string }) => [`${a.id}->${b.id}`, `${b.id}->${a.id}`];

describe("POST /review-cycles", () => {
    it("emparelha quem está no mesmo projeto, nos dois sentidos", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const rui = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projeto.id, { startDate: "2020-01-01" });
        await criarAlocacao(rui.id, projeto.id, { startDate: "2020-01-01" });

        const res = await abrir(header, { name: "Q4", deadline: "2999-12-31" });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Ciclo aberto" });
        expect(res.body.data).toMatchObject({
            name: "Q4",
            companyId: admin.companyId,
            openedBy: admin.id,
            deadline: "2999-12-31",
            closedAt: null,
            requestCount: 2,
        });
        expect(await paresDoCiclo(res.body.data.id)).toEqual(par(ana, rui).sort());
        expect(await pedidos().findBy({ cycleId: res.body.data.id })).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ dueDate: "2999-12-31", requestedBy: admin.id, status: ReviewRequestStatus.Pending }),
            ]),
        );
    });

    it("entra quem saiu do projeto dentro da janela, e fica de fora quem saiu antes", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const recente = await ativo(admin.companyId);
        const antigo = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projeto.id, { startDate: "2020-01-01" });
        await criarAlocacao(recente.id, projeto.id, { startDate: "2020-01-01", endDate: monthsAgo(2) });
        await criarAlocacao(antigo.id, projeto.id, { startDate: "2020-01-01", endDate: monthsAgo(8) });

        const res = await abrir(header, { name: "Q4" });

        // O antigo e o recente também se sobrepuseram, mas antes da janela.
        expect(await paresDoCiclo(res.body.data.id)).toEqual(par(ana, recente).sort());
    });

    it("o since alarga ou aperta a janela", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const rui = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projeto.id, { startDate: "2020-01-01" });
        await criarAlocacao(rui.id, projeto.id, { startDate: "2020-01-01", endDate: monthsAgo(3) });

        const curto = await abrir(header, { name: "Curto", since: monthsAgo(2) });
        const largo = await abrir(header, { name: "Largo", since: monthsAgo(4) });

        expect(curto.body.data.requestCount).toBe(0);
        expect(largo.body.data.requestCount).toBe(2);
    });

    it("não emparelha alocações que não se chegaram a sobrepor", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const rui = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projeto.id, { startDate: monthsAgo(5), endDate: monthsAgo(4) });
        await criarAlocacao(rui.id, projeto.id, { startDate: monthsAgo(3) });

        const res = await abrir(header, { name: "Q4" });

        expect(res.body.data.requestCount).toBe(0);
    });

    it("não emparelha pessoas de projetos diferentes, nem alocações que ainda não começaram", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const rui = await ativo(admin.companyId);
        const futuro = await ativo(admin.companyId);
        const projetoA = await criarProjeto(admin.companyId);
        const projetoB = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projetoA.id, { startDate: "2020-01-01" });
        await criarAlocacao(rui.id, projetoB.id, { startDate: "2020-01-01" });
        await criarAlocacao(futuro.id, projetoA.id, { startDate: "2999-01-01" });

        const res = await abrir(header, { name: "Q4" });

        expect(res.body.data.requestCount).toBe(0);
    });

    it("deixa de fora contas que não estão ativas, e inclui company_admins", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const suspenso = await ativo(admin.companyId, UserRole.Employee, UserStatus.Suspended);
        const convidado = await criarUtilizador({ companyId: admin.companyId });
        const projeto = await criarProjeto(admin.companyId);
        for (const pessoa of [ana, suspenso, convidado, admin]) {
            await criarAlocacao(pessoa.id, projeto.id, { startDate: "2020-01-01" });
        }

        const res = await abrir(header, { name: "Q4" });

        expect(await paresDoCiclo(res.body.data.id)).toEqual(par(ana, admin).sort());
    });

    it("não toca nas pessoas de outras empresas", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const projeto = await criarProjeto(outra.id);
        for (const pessoa of [await ativo(outra.id), await ativo(outra.id)]) {
            await criarAlocacao(pessoa.id, projeto.id, { startDate: "2020-01-01" });
        }

        const res = await abrir(header, { name: "Q4" });

        expect(res.body.data.requestCount).toBe(0);
    });

    it("um system_admin abre um ciclo noutra empresa indicando o companyId", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();

        const semEmpresa = await abrir(header, { name: "Q4" });
        const comEmpresa = await abrir(header, { name: "Q4", companyId: outra.id });

        expect(semEmpresa.status).toBe(400);
        expect(comEmpresa.status).toBe(201);
        expect(comEmpresa.body.data.companyId).toBe(outra.id);
    });

    it("recusa um nome que já existe na empresa", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        await criarCiclo(admin.companyId, admin.id, { name: "Q4" });

        const res = await abrir(header, { name: "Q4" });

        expect(res.status).toBe(409);
    });

    it("recusa a um company_admin abrir um ciclo noutra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await abrir(header, { name: "Q4", companyId: outra.id });

        expect(res.status).toBe(403);
    });

    it("recusa a um employee", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await abrir(header, { name: "Q4" });

        expect(res.status).toBe(403);
    });

    it.each([
        ["o nome em falta", {}, "name"],
        ["um prazo no passado", { name: "Q4", deadline: "2020-01-01" }, "deadline"],
        ["uma janela que começa no futuro", { name: "Q4", since: "2999-01-01" }, "since"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await abrir(header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("GET /review-cycles", () => {
    it("lista os ciclos da empresa, e ?open=true deixa só os abertos", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const aberto = await criarCiclo(admin.companyId, admin.id);
        const fechado = await criarCiclo(admin.companyId, admin.id, { closedAt: new Date() });
        const outra = await criarEmpresa();
        await criarCiclo(outra.id, admin.id);

        const todos = await ler("/review-cycles", header);
        const abertos = await ler("/review-cycles?open=true", header);

        expect(todos.body.data.map((c: { id: string }) => c.id).sort()).toEqual([aberto.id, fechado.id].sort());
        expect(abertos.body.data.map((c: { id: string }) => c.id)).toEqual([aberto.id]);
    });
});

describe("GET /review-cycles/:id", () => {
    it("devolve o progresso, com zeros nos estados vazios", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const [ana, rui] = [await ativo(admin.companyId), await ativo(admin.companyId)];
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });
        await criarPedido(rui, ana.id, admin.id, { cycleId: ciclo.id, status: ReviewRequestStatus.Declined });

        const res = await ler(`/review-cycles/${ciclo.id}`, header);

        expect(res.status).toBe(200);
        expect(res.body.data.progress).toEqual({ pending: 1, submitted: 0, declined: 1, expired: 0 });
    });

    it("responde o mesmo a um ciclo de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const { user: alheio } = await createActor(UserRole.CompanyAdmin);
        const ciclo = await criarCiclo(alheio.companyId, alheio.id);

        const foraDeAlcance = await ler(`/review-cycles/${ciclo.id}`, header);
        const inexistente = await ler(`/review-cycles/${randomUUID()}`, header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });
});

describe("GET /review-cycles/:id/requests", () => {
    it("mostra quem avalia quem e o estado, sem o conteúdo", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const [ana, rui] = [await ativo(admin.companyId), await ativo(admin.companyId)];
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        const pedido = await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });
        await criarAvaliacao(pedido, { comments: "segredo" });

        const res = await ler(`/review-cycles/${ciclo.id}/requests`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            {
                id: pedido.id,
                cycleId: ciclo.id,
                reviewerId: ana.id,
                revieweeId: rui.id,
                status: ReviewRequestStatus.Submitted,
                dueDate: null,
            },
        ]);
        expect(JSON.stringify(res.body)).not.toContain("segredo");
    });
});

describe("POST /review-cycles/:id/close", () => {
    it("fecha o ciclo e expira o que ficou por responder", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const [ana, rui] = [await ativo(admin.companyId), await ativo(admin.companyId)];
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        const pendente = await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });
        const respondido = await criarPedido(rui, ana.id, admin.id, { cycleId: ciclo.id });
        await criarAvaliacao(respondido);
        const adHoc = await criarPedido(ana, rui.id, admin.id);

        const res = await request(app).post(`/review-cycles/${ciclo.id}/close`).set("Authorization", header);

        expect(res.status).toBe(200);
        expect(res.body.data.closedAt).not.toBeNull();
        expect(await pedidos().findOneBy({ id: pendente.id })).toMatchObject({ status: ReviewRequestStatus.Expired });
        expect(await pedidos().findOneBy({ id: respondido.id })).toMatchObject({ status: ReviewRequestStatus.Submitted });
        expect(await pedidos().findOneBy({ id: adHoc.id })).toMatchObject({ status: ReviewRequestStatus.Pending });
    });

    it("recusa fechar um ciclo já fechado", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ciclo = await criarCiclo(admin.companyId, admin.id, { closedAt: new Date("2026-01-01") });

        const res = await request(app).post(`/review-cycles/${ciclo.id}/close`).set("Authorization", header);

        expect(res.status).toBe(409);
        expect((await ciclos().findOneByOrFail({ id: ciclo.id })).closedAt).toEqual(new Date("2026-01-01"));
    });
});

describe("GET /review-cycles/:id/results", () => {
    it("resume por pessoa, e um company_admin não vê a sua linha nem a de outro admin", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const colegaAdmin = await ativo(admin.companyId, UserRole.CompanyAdmin);
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        await criarAvaliacao(await criarPedido(colegaAdmin, ana.id, admin.id, { cycleId: ciclo.id }), {
            recommendsRaise: true,
            performanceScore: 5,
        });
        await criarAvaliacao(await criarPedido(admin, ana.id, admin.id, { cycleId: ciclo.id }), {
            recommendsRaise: false,
            performanceScore: 2,
        });
        await criarAvaliacao(await criarPedido(ana, admin.id, admin.id, { cycleId: ciclo.id }));
        await criarAvaliacao(await criarPedido(ana, colegaAdmin.id, admin.id, { cycleId: ciclo.id }));

        const res = await ler(`/review-cycles/${ciclo.id}/results`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            {
                revieweeId: ana.id,
                requestsReceived: 2,
                reviewsReceived: 2,
                votesForRaise: 1,
                votesAgainst: 1,
                averageScore: 3.5,
            },
        ]);
    });

    it("um system_admin vê toda a gente, incluindo quem ainda não recebeu respostas", async () => {
        const { user: sysadmin, header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();
        const ana = await ativo(empresa.id);
        const admin = await ativo(empresa.id, UserRole.CompanyAdmin);
        const ciclo = await criarCiclo(empresa.id, sysadmin.id);
        await criarPedido(ana, admin.id, sysadmin.id, { cycleId: ciclo.id });

        const res = await ler(`/review-cycles/${ciclo.id}/results`, header);

        expect(res.body.data).toEqual([
            {
                revieweeId: admin.id,
                requestsReceived: 1,
                reviewsReceived: 0,
                votesForRaise: 0,
                votesAgainst: 0,
                averageScore: null,
            },
        ]);
    });
});

describe("prazos", () => {
    it("o dueDate dos pedidos é o deadline do ciclo, e sem deadline fica a null", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const [ana, rui] = [await ativo(admin.companyId), await ativo(admin.companyId)];
        const projeto = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, projeto.id, { startDate: isoDate() });
        await criarAlocacao(rui.id, projeto.id, { startDate: isoDate() });

        const res = await abrir(header, { name: "Sem prazo" });

        expect((await pedidos().findBy({ cycleId: res.body.data.id })).map((p) => p.dueDate)).toEqual([null, null]);
    });
});
