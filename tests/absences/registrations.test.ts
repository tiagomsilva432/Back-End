import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Notification } from "../../src/entities/Notification.js";
import { AbsenceStatus, AbsenceType, UserRole, UserStatus } from "../../src/types/enums.js";
import { addDays, isoDate } from "../../src/utils/dates.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarAusencia, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const ativo = (companyId: string, role = UserRole.Employee, status = UserStatus.Active) =>
    criarUtilizador({ companyId, role, status, password: "Password1!", mustChangePassword: false });

const registar = (userId: string, header: string, corpo: object) =>
    request(app).post(`/users/${userId}/absences`).set("Authorization", header).send(corpo);

const ler = (caminho: string, header: string) =>
    request(app).get(caminho).set("Authorization", header);

const recebidas = async (userId: string) =>
    (await repo(Notification).find({ where: { recipientId: userId }, order: { id: "ASC" } }))
        .map(({ type, data }) => ({ type, data }));

// Segunda, 5 de janeiro de 2026: um dia útil que já passou.
const falta = { type: AbsenceType.Unjustified, startDate: "2026-01-05", endDate: "2026-01-05" };

/** Um company_admin, uma employee com um projeto, e a gestora desse projeto. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const gestora = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Website", { managerId: gestora.id });
    await criarAlocacao(ana.id, projeto.id, { startDate: "2025-01-01" });

    return { admin, header, ana, gestora };
};

describe("POST /users/{id}/absences", () => {
    it("marca uma falta já aprovada e avisa a pessoa; os gestores não, porque já passou", async () => {
        const { admin, header, ana, gestora } = await cenario();

        const res = await registar(ana.id, header, { ...falta, note: "Não apareceu nem avisou" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            userId: ana.id,
            companyId: ana.companyId,
            type: AbsenceType.Unjustified,
            status: AbsenceStatus.Approved,
            decidedBy: admin.id,
            note: "Não apareceu nem avisou",
            workingDays: 1,
        });
        expect(res.body.data.decidedAt).not.toBeNull();
        expect(await recebidas(ana.id)).toEqual([{
            type: "absence.registered",
            data: {
                absenceId: res.body.data.id,
                userId: ana.id,
                type: AbsenceType.Unjustified,
                startDate: "2026-01-05",
                endDate: "2026-01-05",
            },
        }]);
        expect(await recebidas(gestora.id)).toEqual([]);
        expect(await recebidas(admin.id)).toEqual([]);
    });

    it("regista férias futuras em nome de alguém, e a gestora fica a saber", async () => {
        const { header, ana, gestora } = await cenario();

        const res = await registar(ana.id, header, {
            type: AbsenceType.Vacation,
            startDate: "2099-07-06",
            endDate: "2099-07-10",
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ type: AbsenceType.Vacation, status: AbsenceStatus.Approved });
        expect((await recebidas(ana.id)).map((n) => n.type)).toEqual(["absence.registered"]);
        expect(await recebidas(gestora.id)).toEqual([{
            type: "absence.teammate_away",
            data: {
                absenceId: res.body.data.id,
                userId: ana.id,
                type: AbsenceType.Vacation,
                startDate: "2099-07-06",
                endDate: "2099-07-10",
            },
        }]);
    });

    it("uma baixa que começa hoje chega à gestora como ausente", async () => {
        const { header, ana, gestora } = await cenario();
        const hoje = isoDate();

        const res = await registar(ana.id, header, { type: AbsenceType.Sick, startDate: hoje, endDate: addDays(hoje, 6) });

        expect(res.status).toBe(201);
        expect((await recebidas(gestora.id))[0]).toMatchObject({ type: "absence.teammate_away", data: { type: "absent" } });
    });

    it("recusa uma falta no futuro, um intervalo só de fim de semana, e uma que toca noutro pedido", async () => {
        const { header, ana } = await cenario();
        const hoje = isoDate();
        await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-02-02", endDate: "2026-02-06" });

        const futura = await registar(ana.id, header, { ...falta, startDate: hoje, endDate: addDays(hoje, 1) });
        const fimDeSemana = await registar(ana.id, header, { ...falta, startDate: "2026-01-03", endDate: "2026-01-04" });
        const sobreposta = await registar(ana.id, header, { ...falta, startDate: "2026-02-04", endDate: "2026-02-04" });

        expect(futura.status).toBe(400);
        expect(futura.body.data).toContainEqual({ field: "endDate", message: "Uma falta não pode ser marcada em dias futuros" });
        expect(fimDeSemana.status).toBe(400);
        expect(sobreposta.status).toBe(409);
        expect(sobreposta.body.message).toBe("Esta pessoa já tem um pedido pendente ou aprovado nesses dias");
    });

    it("um employee recebe 403, um admin de fora 404, o próprio 403, e uma conta terminada 409", async () => {
        const { admin, header, ana } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);
        const terminada = await ativo(admin.companyId, UserRole.Employee, UserStatus.Terminated);

        expect((await registar(ana.id, authorization(ana), falta)).status).toBe(403);
        expect((await registar(ana.id, deFora, falta)).status).toBe(404);
        expect((await registar(admin.id, header, falta)).status).toBe(403);
        expect((await registar(terminada.id, header, falta)).status).toBe(409);
    });

    it("um system_admin marca faltas em qualquer empresa", async () => {
        const { ana } = await cenario();
        const { header: sysadmin } = await createActor(UserRole.SystemAdmin);

        expect((await registar(ana.id, sysadmin, falta)).status).toBe(201);
    });
});

describe("as faltas, vistas por quem as tem", () => {
    it("ninguém pede uma falta para si próprio", async () => {
        const { ana } = await cenario();

        const res = await request(app).post("/absences").set("Authorization", authorization(ana)).send(falta);

        expect(res.status).toBe(400);
    });

    it("a pessoa vê as suas faltas na lista, filtradas por tipo, e no resumo do ano", async () => {
        const { header, ana } = await cenario();
        const marcada = await registar(ana.id, header, falta);
        await criarAusencia(ana, { startDate: "2099-07-06", endDate: "2099-07-10" });

        const todas = await ler("/absences/mine", authorization(ana));
        const faltas = await ler("/absences/mine?type=unjustified", authorization(ana));
        const resumo = await ler(`/users/${ana.id}/absence-summary?year=2026`, authorization(ana));

        expect(todas.body.data).toHaveLength(2);
        expect(faltas.body.data.map((a: { id: string }) => a.id)).toEqual([marcada.body.data.id]);
        expect(resumo.body.data).toMatchObject({ unjustified: 1 });
    });

    it("no calendário, um colega vê ausente, e a pessoa vê a falta", async () => {
        const { admin, header, ana } = await cenario();
        const rui = await ativo(admin.companyId);
        await registar(ana.id, header, falta);

        const janeiro = "/calendar?from=2026-01-01&to=2026-01-31";
        const doColega = await ler(janeiro, authorization(rui));
        const daPropria = await ler(janeiro, authorization(ana));

        expect(doColega.body.data.absences[0]).toMatchObject({ userId: ana.id, type: "absent" });
        expect(daPropria.body.data.absences[0]).toMatchObject({ userId: ana.id, type: AbsenceType.Unjustified });
    });
});
