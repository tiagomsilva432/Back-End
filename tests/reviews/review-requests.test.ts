import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Review } from "../../src/entities/Review.js";
import { ReviewRequest } from "../../src/entities/ReviewRequest.js";
import { User } from "../../src/entities/User.js";
import { ReviewRequestStatus, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarCiclo, criarEmpresa, criarPedido, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const pedidos = () => repo(ReviewRequest);
const avaliacoes = () => repo(Review);

const ativo = (companyId: string, role = UserRole.Employee, status = UserStatus.Active) =>
    criarUtilizador({ companyId, role, status, password: "Password1!", mustChangePassword: false });

/** Um company_admin e dois employees ativos da mesma empresa. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);

    return { admin, header, ana, rui };
};

describe("POST /review-requests", () => {
    const pedir = (header: string, corpo: object) =>
        request(app).post("/review-requests").set("Authorization", header).send(corpo);

    it("cria um pedido ad-hoc", async () => {
        const { admin, header, ana, rui } = await cenario();

        const res = await pedir(header, { reviewerId: ana.id, revieweeId: rui.id, dueDate: "2999-01-01" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            cycleId: null,
            reviewerId: ana.id,
            revieweeId: rui.id,
            status: ReviewRequestStatus.Pending,
            dueDate: "2999-01-01",
        });
        expect(await pedidos().findOneBy({ id: res.body.data.id })).toMatchObject({
            companyId: admin.companyId,
            requestedBy: admin.id,
        });
    });

    it("recusa um segundo pedido por responder para o mesmo par, mas aceita o par ao contrário", async () => {
        const { admin, header, ana, rui } = await cenario();
        await criarPedido(ana, rui.id, admin.id);

        const repetido = await pedir(header, { reviewerId: ana.id, revieweeId: rui.id });
        const inverso = await pedir(header, { reviewerId: rui.id, revieweeId: ana.id });

        expect(repetido.status).toBe(409);
        expect(inverso.status).toBe(201);
    });

    it("aceita um par que já foi pedido e respondido, ou que tem um pedido de ciclo", async () => {
        const { admin, header, ana, rui } = await cenario();
        await criarPedido(ana, rui.id, admin.id, { status: ReviewRequestStatus.Submitted });
        const ciclo = await criarCiclo(admin.companyId, admin.id);
        await criarPedido(ana, rui.id, admin.id, { cycleId: ciclo.id });

        const res = await pedir(header, { reviewerId: ana.id, revieweeId: rui.id });

        expect(res.status).toBe(201);
    });

    it("recusa uma conta que não está ativa", async () => {
        const { admin, header, ana } = await cenario();
        const suspenso = await ativo(admin.companyId, UserRole.Employee, UserStatus.Suspended);

        const res = await pedir(header, { reviewerId: ana.id, revieweeId: suspenso.id });

        expect(res.status).toBe(409);
    });

    it("responde 404 a uma pessoa de outra empresa, também para um system_admin", async () => {
        const { header, ana } = await cenario();
        const alheia = await ativo((await criarEmpresa()).id);
        const { header: sysadmin } = await createActor(UserRole.SystemAdmin);

        const doAdmin = await pedir(header, { reviewerId: ana.id, revieweeId: alheia.id });
        const doSysadmin = await pedir(sysadmin, { reviewerId: ana.id, revieweeId: alheia.id });

        expect(doAdmin.status).toBe(404);
        expect(doSysadmin.status).toBe(404);
    });

    it("recusa a um employee", async () => {
        const { ana, rui } = await cenario();

        const res = await pedir(authorization(ana), { reviewerId: ana.id, revieweeId: rui.id });

        expect(res.status).toBe(403);
    });

    it.each([
        ["a mesma pessoa dos dois lados", "mesma", "revieweeId"],
        ["um prazo no passado", "passado", "dueDate"],
    ])("devolve 400 com %s", async (_titulo, caso, field) => {
        const { header, ana, rui } = await cenario();
        const corpo = caso === "mesma"
            ? { reviewerId: ana.id, revieweeId: ana.id }
            : { reviewerId: ana.id, revieweeId: rui.id, dueDate: "2020-01-01" };

        const res = await pedir(header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("GET /review-requests/mine", () => {
    it("mostra só os pedidos em que quem pergunta é o reviewer", async () => {
        const { admin, ana, rui } = await cenario();
        const meu = await criarPedido(ana, rui.id, admin.id);
        await criarPedido(rui, ana.id, admin.id);

        const res = await request(app).get("/review-requests/mine").set("Authorization", authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([meu.id]);
    });

    it("filtra por estado", async () => {
        const { admin, ana, rui } = await cenario();
        await criarPedido(ana, rui.id, admin.id, { status: ReviewRequestStatus.Declined });
        const pendente = await criarPedido(ana, admin.id, admin.id);

        const res = await request(app)
            .get("/review-requests/mine?status=pending")
            .set("Authorization", authorization(ana));

        expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([pendente.id]);
    });
});

describe("POST /review-requests/:id/review", () => {
    const responder = (id: string, header: string, corpo: object) =>
        request(app).post(`/review-requests/${id}/review`).set("Authorization", header).send(corpo);

    it("grava a avaliação e marca o pedido como submetido", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const res = await responder(pedido.id, authorization(ana), {
            recommendsRaise: true,
            performanceScore: 4,
            comments: "  Excelente colega  ",
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            requestId: pedido.id,
            recommendsRaise: true,
            performanceScore: 4,
            comments: "Excelente colega",
        });
        expect(await pedidos().findOneBy({ id: pedido.id })).toMatchObject({ status: ReviewRequestStatus.Submitted });
        expect(await avaliacoes().countBy({ requestId: pedido.id })).toBe(1);
    });

    it("a nota e os comentários são opcionais", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const res = await responder(pedido.id, authorization(ana), { recommendsRaise: false });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ performanceScore: null, comments: null });
    });

    it("responde 404 a quem não é o reviewer, igual a um pedido que não existe", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const doRevisto = await responder(pedido.id, authorization(rui), { recommendsRaise: true });
        const doAdmin = await responder(pedido.id, authorization(admin), { recommendsRaise: true });
        const inexistente = await responder(randomUUID(), authorization(ana), { recommendsRaise: true });

        expect(doRevisto.status).toBe(404);
        expect(doAdmin.status).toBe(404);
        expect(doRevisto.body).toEqual(inexistente.body);
        expect(await pedidos().findOneBy({ id: pedido.id })).toMatchObject({ status: ReviewRequestStatus.Pending });
    });

    it.each([ReviewRequestStatus.Submitted, ReviewRequestStatus.Declined, ReviewRequestStatus.Expired])(
        "recusa um pedido %s",
        async (status) => {
            const { admin, ana, rui } = await cenario();
            const pedido = await criarPedido(ana, rui.id, admin.id, { status });

            const res = await responder(pedido.id, authorization(ana), { recommendsRaise: true });

            expect(res.status).toBe(409);
            expect(await avaliacoes().countBy({ requestId: pedido.id })).toBe(0);
        },
    );

    it("um pedido fora de prazo expira e responde 409", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id, { dueDate: "2020-01-01" });

        const res = await responder(pedido.id, authorization(ana), { recommendsRaise: true });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe("O prazo deste pedido terminou");
        expect(await pedidos().findOneBy({ id: pedido.id })).toMatchObject({ status: ReviewRequestStatus.Expired });
        expect(await avaliacoes().countBy({ requestId: pedido.id })).toBe(0);
    });

    it("um reviewer que foi suspenso já não responde", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);
        await repo(User).update(ana.id, { status: UserStatus.Suspended });

        const res = await responder(pedido.id, authorization(ana), { recommendsRaise: true });

        expect(res.status).toBe(403);
    });

    it.each([
        ["sem recommendsRaise", {}, "recommendsRaise"],
        ["recommendsRaise em texto", { recommendsRaise: "sim" }, "recommendsRaise"],
        ["nota 0", { recommendsRaise: true, performanceScore: 0 }, "performanceScore"],
        ["nota 6", { recommendsRaise: true, performanceScore: 6 }, "performanceScore"],
        ["comentário vazio", { recommendsRaise: true, comments: "   " }, "comments"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const res = await responder(pedido.id, authorization(ana), corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("POST /review-requests/:id/decline", () => {
    const recusar = (id: string, header: string) =>
        request(app).post(`/review-requests/${id}/decline`).set("Authorization", header);

    it("o reviewer recusa um pedido pendente", async () => {
        const { admin, ana, rui } = await cenario();
        const pedido = await criarPedido(ana, rui.id, admin.id);

        const res = await recusar(pedido.id, authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(ReviewRequestStatus.Declined);
        expect(await pedidos().findOneBy({ id: pedido.id })).toMatchObject({ status: ReviewRequestStatus.Declined });
    });

    it("responde 404 a outra pessoa, e 409 a um pedido já respondido", async () => {
        const { admin, ana, rui } = await cenario();
        const pendente = await criarPedido(ana, rui.id, admin.id);
        const respondido = await criarPedido(ana, admin.id, admin.id, { status: ReviewRequestStatus.Submitted });

        expect((await recusar(pendente.id, authorization(rui))).status).toBe(404);
        expect((await recusar(respondido.id, authorization(ana))).status).toBe(409);
    });
});
