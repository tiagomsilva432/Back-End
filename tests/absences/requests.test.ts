import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { AbsenceRequest } from "../../src/entities/AbsenceRequest.js";
import { Notification } from "../../src/entities/Notification.js";
import { AbsenceStatus, AbsenceType, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAusencia, criarFeriado, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const ausencias = () => repo(AbsenceRequest);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const pedir = (header: string, corpo: object) =>
    request(app).post("/absences").set("Authorization", header).send(corpo);

const ler = (caminho: string, header: string) =>
    request(app).get(caminho).set("Authorization", header);

/** As notificações de uma pessoa, só tipo e dados. */
const recebidas = async (userId: string) =>
    (await repo(Notification).find({ where: { recipientId: userId }, order: { id: "ASC" } }))
        .map(({ type, data }) => ({ type, data }));

// Segunda 7 a sexta 11 de dezembro de 2026, com o dia 8 (Imaculada Conceição) pelo meio.
const baixa = { type: AbsenceType.Sick, startDate: "2026-12-07", endDate: "2026-12-11" };

/** Um company_admin, uma employee, e um colega. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);

    return { admin, header, ana, rui };
};

describe("POST /absences", () => {
    it("fica pendente, conta os dias úteis sem o feriado, e avisa os company_admins ativos", async () => {
        const { admin, ana } = await cenario();
        const suspenso = await criarUtilizador({
            companyId: admin.companyId,
            role: UserRole.CompanyAdmin,
            status: UserStatus.Suspended,
            password: "Password1!",
            mustChangePassword: false,
        });

        const res = await pedir(authorization(ana), { ...baixa, note: "Gripe" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            companyId: ana.companyId,
            userId: ana.id,
            type: AbsenceType.Sick,
            status: AbsenceStatus.Pending,
            startDate: "2026-12-07",
            endDate: "2026-12-11",
            workingDays: 4,
            note: "Gripe",
            decidedBy: null,
            decidedAt: null,
        });
        expect(await recebidas(admin.id)).toEqual([{
            type: "absence.requested",
            data: {
                absenceId: res.body.data.id,
                userId: ana.id,
                type: AbsenceType.Sick,
                startDate: "2026-12-07",
                endDate: "2026-12-11",
            },
        }]);
        expect(await recebidas(suspenso.id)).toEqual([]);
        expect(await recebidas(ana.id)).toEqual([]);
    });

    it("os feriados da empresa também saem dos dias úteis", async () => {
        const { admin, ana } = await cenario();
        await criarFeriado(admin.companyId, admin.id, { date: "2026-12-09" });

        const res = await pedir(authorization(ana), baixa);

        expect(res.status).toBe(201);
        expect(res.body.data.workingDays).toBe(3);
    });

    it("um company_admin também pede, e não é avisado do próprio pedido", async () => {
        const { admin, header } = await cenario();
        const outro = await ativo(admin.companyId, UserRole.CompanyAdmin);

        const res = await pedir(header, baixa);

        expect(res.status).toBe(201);
        expect(await recebidas(admin.id)).toEqual([]);
        expect((await recebidas(outro.id)).map((n) => n.type)).toEqual(["absence.requested"]);
    });

    it("aceita férias no futuro, e uma baixa no passado", async () => {
        const { ana } = await cenario();

        const ferias = await pedir(authorization(ana), {
            type: AbsenceType.Vacation,
            startDate: "2099-07-06",
            endDate: "2099-07-10",
        });
        const passada = await pedir(authorization(ana), { ...baixa, startDate: "2020-01-06", endDate: "2020-01-06" });

        expect(ferias.status).toBe(201);
        expect(ferias.body.data.workingDays).toBe(5);
        expect(passada.status).toBe(201);
    });

    it("recusa férias no passado, um fim antes do início, e um tipo que não existe", async () => {
        const { ana } = await cenario();
        const header = authorization(ana);

        const passado = await pedir(header, { type: AbsenceType.Vacation, startDate: "2020-01-06", endDate: "2020-01-10" });
        const invertido = await pedir(header, { ...baixa, startDate: "2026-12-11", endDate: "2026-12-07" });
        const tipo = await pedir(header, { ...baixa, type: "sabatica" });

        expect(passado.status).toBe(400);
        expect(passado.body.data).toContainEqual({ field: "startDate", message: "As férias não podem começar no passado" });
        expect(invertido.status).toBe(400);
        expect(invertido.body.data).toContainEqual({ field: "endDate", message: "O fim não pode ser antes do início" });
        expect(tipo.status).toBe(400);
        expect(await ausencias().count()).toBe(0);
    });

    it("aceita até 366 dias, contando as duas pontas, e recusa mais", async () => {
        const { ana } = await cenario();

        const demais = await pedir(authorization(ana), { ...baixa, startDate: "2026-01-01", endDate: "2027-01-02" });
        const limite = await pedir(authorization(ana), { ...baixa, startDate: "2026-01-01", endDate: "2027-01-01" });

        expect(demais.status).toBe(400);
        expect(demais.body.data[0].field).toBe("endDate");
        expect(limite.status).toBe(201);
    });

    it("recusa um intervalo só de fim de semana e feriados", async () => {
        const { ana } = await cenario();
        const header = authorization(ana);

        expect((await pedir(header, { ...baixa, startDate: "2026-12-26", endDate: "2026-12-27" })).status).toBe(400);
        expect((await pedir(header, { ...baixa, startDate: "2026-12-25", endDate: "2026-12-25" })).status).toBe(400);
        expect(await ausencias().count()).toBe(0);
    });

    it("recusa tocar num pedido pendente ou aprovado, mas não num recusado ou cancelado", async () => {
        const { ana } = await cenario();
        const header = authorization(ana);
        await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-12-14", endDate: "2026-12-18" });
        await criarAusencia(ana, { status: AbsenceStatus.Rejected, startDate: "2026-11-02", endDate: "2026-11-06" });
        await criarAusencia(ana, { status: AbsenceStatus.Cancelled, startDate: "2026-11-09", endDate: "2026-11-13" });

        const sobreposto = await pedir(header, { ...baixa, startDate: "2026-12-18", endDate: "2026-12-22" });

        expect(sobreposto.status).toBe(409);
        expect((await pedir(header, { ...baixa, startDate: "2026-11-03", endDate: "2026-11-04" })).status).toBe(201);
        expect((await pedir(header, { ...baixa, startDate: "2026-11-10", endDate: "2026-11-10" })).status).toBe(201);
    });

    it("um colega com um pedido nos mesmos dias não conta", async () => {
        const { ana, rui } = await cenario();
        await criarAusencia(rui, { status: AbsenceStatus.Approved, startDate: "2026-12-07", endDate: "2026-12-11" });

        expect((await pedir(authorization(ana), baixa)).status).toBe(201);
    });
});

describe("GET /absences/mine", () => {
    it("só os seus, do que começa mais tarde para o mais cedo, e filtra por estado", async () => {
        const { ana, rui } = await cenario();
        const antigo = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-11-02", endDate: "2026-11-06" });
        const novo = await criarAusencia(ana, { startDate: "2026-12-14", endDate: "2026-12-18" });
        await criarAusencia(rui);

        const todos = await ler("/absences/mine", authorization(ana));
        const aprovados = await ler("/absences/mine?status=APPROVED", authorization(ana));

        expect(todos.status).toBe(200);
        expect(todos.body.data.map((a: { id: string }) => a.id)).toEqual([novo.id, antigo.id]);
        expect(todos.body.data[0].workingDays).toBe(5);
        expect(aprovados.body.data.map((a: { id: string }) => a.id)).toEqual([antigo.id]);
    });
});

describe("GET /absences", () => {
    it("um company_admin vê os da sua empresa, com tudo, e filtra por pessoa e estado", async () => {
        const { header, ana, rui } = await cenario();
        const daAna = await criarAusencia(ana, { type: AbsenceType.Sick, note: "Gripe" });
        const doRui = await criarAusencia(rui, { status: AbsenceStatus.Approved, startDate: "2026-11-02", endDate: "2026-11-06" });
        const { user: fora } = await createActor(UserRole.Employee);
        await criarAusencia(fora);

        const todos = await ler("/absences", header);
        const daAnaPendentes = await ler(`/absences?userId=${ana.id}&status=pending`, header);

        expect(todos.status).toBe(200);
        expect(todos.body.data.map((a: { id: string }) => a.id)).toEqual([daAna.id, doRui.id]);
        expect(todos.body.data[0]).toMatchObject({ type: AbsenceType.Sick, note: "Gripe" });
        expect(daAnaPendentes.body.data.map((a: { id: string }) => a.id)).toEqual([daAna.id]);
    });

    it("recusa um employee, e um company_admin que pede outra empresa", async () => {
        const { header, ana } = await cenario();
        const { user: fora } = await createActor(UserRole.CompanyAdmin);

        expect((await ler("/absences", authorization(ana))).status).toBe(403);
        expect((await ler(`/absences?companyId=${fora.companyId}`, header)).status).toBe(403);
    });

    it("um system_admin vê todas as empresas, ou a que indicar", async () => {
        const { ana } = await cenario();
        const { user: fora } = await createActor(UserRole.Employee);
        const daAna = await criarAusencia(ana);
        const deFora = await criarAusencia(fora);
        const { header } = await createActor(UserRole.SystemAdmin);

        const todas = await ler("/absences", header);
        const uma = await ler(`/absences?companyId=${fora.companyId}`, header);

        expect(todas.body.data.map((a: { id: string }) => a.id).sort()).toEqual([daAna.id, deFora.id].sort());
        expect(uma.body.data.map((a: { id: string }) => a.id)).toEqual([deFora.id]);
    });
});

describe("GET /absences/{id}", () => {
    it("a pessoa e o admin veem; um colega, outra empresa ou um id que não é uuid dão 404", async () => {
        const { header, ana, rui } = await cenario();
        const pedido = await criarAusencia(ana, { type: AbsenceType.Sick, note: "Gripe" });
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);

        const propria = await ler(`/absences/${pedido.id}`, authorization(ana));

        expect(propria.status).toBe(200);
        expect(propria.body.data).toMatchObject({ id: pedido.id, type: AbsenceType.Sick, note: "Gripe", workingDays: 5 });
        expect((await ler(`/absences/${pedido.id}`, header)).status).toBe(200);
        expect((await ler(`/absences/${pedido.id}`, authorization(rui))).status).toBe(404);
        expect((await ler(`/absences/${pedido.id}`, deFora)).status).toBe(404);
        expect((await ler("/absences/nao-e-um-id", header)).status).toBe(404);
    });
});

describe("GET /users/{id}/absence-summary", () => {
    it("conta os dias úteis aprovados que caem no ano, por tipo", async () => {
        const { header, ana } = await cenario();
        // De 28 de dezembro a 8 de janeiro: quatro dias em 2026, e cinco em 2027 (o dia 1 é feriado).
        await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-12-28", endDate: "2027-01-08" });
        await criarAusencia(ana, {
            type: AbsenceType.Sick,
            status: AbsenceStatus.Approved,
            startDate: "2026-12-07",
            endDate: "2026-12-11",
        });
        await criarAusencia(ana, { type: AbsenceType.Leave, startDate: "2026-11-02", endDate: "2026-11-06" });

        const de2026 = await ler(`/users/${ana.id}/absence-summary?year=2026`, header);
        const de2027 = await ler(`/users/${ana.id}/absence-summary?year=2027`, authorization(ana));

        expect(de2026.status).toBe(200);
        expect(de2026.body.data).toEqual({ userId: ana.id, year: 2026, vacation: 4, sick: 4, leave: 0 });
        expect(de2027.body.data).toEqual({ userId: ana.id, year: 2027, vacation: 5, sick: 0, leave: 0 });
    });

    it("um colega recebe 403, e alguém de fora 404", async () => {
        const { ana, rui } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);

        expect((await ler(`/users/${ana.id}/absence-summary`, authorization(rui))).status).toBe(403);
        expect((await ler(`/users/${ana.id}/absence-summary`, deFora)).status).toBe(404);
    });
});
