import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAvaliacao, criarCiclo, criarEmpresa, criarPedido, criarUtilizador } from "../helpers/factories.js";

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, status: UserStatus.Active, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

/** A Ana avaliada por dois colegas, um num ciclo e outro ad-hoc. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const eva = await ativo(admin.companyId);
    const ciclo = await criarCiclo(admin.companyId, admin.id);

    await criarAvaliacao(await criarPedido(rui, ana.id, admin.id, { cycleId: ciclo.id }), {
        recommendsRaise: true,
        performanceScore: 5,
        comments: "Muito boa",
    });
    await criarAvaliacao(await criarPedido(eva, ana.id, admin.id), {
        recommendsRaise: false,
        performanceScore: 2,
        comments: "Pode melhorar",
    });
    // Pedido por responder: conta como pedido, não como avaliação.
    await criarPedido(admin, ana.id, admin.id, { cycleId: ciclo.id });

    return { admin, header, ana, rui, eva, ciclo };
};

describe("GET /users/:id/review-summary", () => {
    it("resume todas as avaliações da pessoa", async () => {
        const { header, ana } = await cenario();

        const res = await ler(`/users/${ana.id}/review-summary`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            revieweeId: ana.id,
            requestsReceived: 3,
            reviewsReceived: 2,
            votesForRaise: 1,
            votesAgainst: 1,
            averageScore: 3.5,
        });
    });

    it("?cycleId= deixa só as desse ciclo", async () => {
        const { header, ana, ciclo } = await cenario();

        const res = await ler(`/users/${ana.id}/review-summary?cycleId=${ciclo.id}`, header);

        expect(res.body.data).toMatchObject({ requestsReceived: 2, reviewsReceived: 1, votesForRaise: 1, averageScore: 5 });
    });

    it("quem nunca foi avaliado recebe zeros", async () => {
        const { admin, header } = await cenario();
        const novo = await ativo(admin.companyId);

        const res = await ler(`/users/${novo.id}/review-summary`, header);

        expect(res.body.data).toEqual({
            revieweeId: novo.id,
            requestsReceived: 0,
            reviewsReceived: 0,
            votesForRaise: 0,
            votesAgainst: 0,
            averageScore: null,
        });
    });

    it("a própria pessoa nunca vê os seus resultados", async () => {
        const { ana } = await cenario();

        const res = await ler(`/users/${ana.id}/review-summary`, authorization(ana));

        expect(res.status).toBe(403);
    });

    it("um company_admin não vê os seus nem os de outro company_admin", async () => {
        const { admin, header } = await cenario();
        const colega = await ativo(admin.companyId, UserRole.CompanyAdmin);

        expect((await ler(`/users/${admin.id}/review-summary`, header)).status).toBe(403);
        expect((await ler(`/users/${colega.id}/review-summary`, header)).status).toBe(403);
    });

    it("um system_admin vê os de um company_admin", async () => {
        const { admin } = await cenario();
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await ler(`/users/${admin.id}/review-summary`, header);

        expect(res.status).toBe(200);
    });

    it("um ciclo de outra empresa no filtro responde 404", async () => {
        const { header, ana } = await cenario();
        const { user: alheio } = await createActor(UserRole.CompanyAdmin);
        const cicloAlheio = await criarCiclo(alheio.companyId, alheio.id);

        const res = await ler(`/users/${ana.id}/review-summary?cycleId=${cicloAlheio.id}`, header);

        expect(res.status).toBe(404);
    });

    it("responde 404 a uma pessoa de outra empresa", async () => {
        const { header } = await cenario();
        const alheia = await ativo((await criarEmpresa()).id);

        expect((await ler(`/users/${alheia.id}/review-summary`, header)).status).toBe(404);
        expect((await ler(`/users/${randomUUID()}/review-summary`, header)).status).toBe(404);
    });
});

describe("GET /users/:id/reviews", () => {
    it("devolve as avaliações sem quem as escreveu, da melhor nota para a pior", async () => {
        const { header, ana, rui, eva, ciclo } = await cenario();

        const res = await ler(`/users/${ana.id}/reviews`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            {
                cycleId: ciclo.id,
                recommendsRaise: true,
                performanceScore: 5,
                comments: "Muito boa",
                submittedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            },
            {
                cycleId: null,
                recommendsRaise: false,
                performanceScore: 2,
                comments: "Pode melhorar",
                submittedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            },
        ]);
        const corpo = JSON.stringify(res.body);
        expect(corpo).not.toContain(rui.id);
        expect(corpo).not.toContain(eva.id);
        expect(corpo).not.toContain("requestId");
        expect(corpo).not.toContain("reviewerId");
    });

    it("?cycleId= deixa só as desse ciclo", async () => {
        const { header, ana, ciclo } = await cenario();

        const res = await ler(`/users/${ana.id}/reviews?cycleId=${ciclo.id}`, header);

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].comments).toBe("Muito boa");
    });

    it("a própria pessoa e um colega recebem 403", async () => {
        const { ana, rui } = await cenario();

        expect((await ler(`/users/${ana.id}/reviews`, authorization(ana))).status).toBe(403);
        expect((await ler(`/users/${ana.id}/reviews`, authorization(rui))).status).toBe(403);
    });

    it("devolve 400 com um cycleId que não é uuid", async () => {
        const { header, ana } = await cenario();

        const res = await ler(`/users/${ana.id}/reviews?cycleId=abc`, header);

        expect(res.status).toBe(400);
    });
});
