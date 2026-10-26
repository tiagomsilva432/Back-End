import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { AbsenceRequest } from "../../src/entities/AbsenceRequest.js";
import { Notification } from "../../src/entities/Notification.js";
import { AbsenceStatus, AbsenceType, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarAusencia, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const ausencias = () => repo(AbsenceRequest);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const acao = (id: string, verbo: "approve" | "reject" | "cancel", header: string, corpo?: object) => {
    const pedido = request(app).post(`/absences/${id}/${verbo}`).set("Authorization", header);
    return corpo ? pedido.send(corpo) : pedido;
};

const recebidas = async (userId: string) =>
    (await repo(Notification).find({ where: { recipientId: userId }, order: { id: "ASC" } }))
        .map(({ type, data }) => ({ type, data }));

const tipos = async (userId: string) => (await recebidas(userId)).map((n) => n.type);

/** Um company_admin, uma employee e um colega. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);

    return { admin, header, ana, rui };
};

describe("POST /absences/{id}/approve", () => {
    it("aprova, avisa a pessoa, e avisa os gestores dos projetos dela nesses dias com o tipo tapado", async () => {
        const { admin, header, ana, rui } = await cenario();
        const gestora = await ativo(admin.companyId);
        const antigo = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId, "Website", { managerId: gestora.id });
        const passado = await criarProjeto(admin.companyId, "Intranet", { managerId: antigo.id });
        await criarAlocacao(ana.id, projeto.id, { startDate: "2026-01-01" });
        await criarAlocacao(ana.id, passado.id, { startDate: "2026-01-01", endDate: "2026-06-30" });
        const pedido = await criarAusencia(ana, { type: AbsenceType.Sick });

        const res = await acao(pedido.id, "approve", header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            status: AbsenceStatus.Approved,
            decidedBy: admin.id,
            decisionNote: null,
            workingDays: 5,
        });
        expect(res.body.data.decidedAt).not.toBeNull();

        const dados = {
            absenceId: pedido.id,
            userId: ana.id,
            startDate: "2026-12-14",
            endDate: "2026-12-18",
        };
        expect(await recebidas(ana.id)).toEqual([{ type: "absence.approved", data: { ...dados, type: AbsenceType.Sick } }]);
        expect(await recebidas(gestora.id)).toEqual([{ type: "absence.teammate_away", data: { ...dados, type: "absent" } }]);
        expect(await recebidas(antigo.id)).toEqual([]);
        expect(await recebidas(rui.id)).toEqual([]);
        expect(await recebidas(admin.id)).toEqual([]);
    });

    it("as férias chegam aos gestores como férias, e a pessoa que gere o seu projeto não é avisada duas vezes", async () => {
        const { admin, header, ana } = await cenario();
        const projeto = await criarProjeto(admin.companyId, "Website", { managerId: ana.id });
        await criarAlocacao(ana.id, projeto.id);
        const gestor = await ativo(admin.companyId);
        const outro = await criarProjeto(admin.companyId, "App", { managerId: gestor.id });
        await criarAlocacao(ana.id, outro.id);
        const pedido = await criarAusencia(ana);

        await acao(pedido.id, "approve", header);

        expect(await tipos(ana.id)).toEqual(["absence.approved"]);
        expect((await recebidas(gestor.id))[0]?.data).toMatchObject({ type: AbsenceType.Vacation });
    });

    it("um employee não aprova o de um colega (404), e ninguém aprova o seu (403)", async () => {
        const { admin, header, ana, rui } = await cenario();
        const daAna = await criarAusencia(ana);
        const doAdmin = await criarAusencia(admin);

        expect((await acao(daAna.id, "approve", authorization(rui))).status).toBe(404);
        expect((await acao(daAna.id, "approve", authorization(ana))).status).toBe(403);
        expect((await acao(doAdmin.id, "approve", header)).status).toBe(403);
        expect((await ausencias().findOneByOrFail({ id: daAna.id })).status).toBe(AbsenceStatus.Pending);
    });

    it("o pedido de um company_admin decide-o outro company_admin, ou um system_admin", async () => {
        const { admin, header } = await cenario();
        const outro = await ativo(admin.companyId, UserRole.CompanyAdmin);
        const { header: sysadmin } = await createActor(UserRole.SystemAdmin);
        const primeiro = await criarAusencia(outro);
        const segundo = await criarAusencia(admin, { startDate: "2026-11-02", endDate: "2026-11-06" });

        expect((await acao(primeiro.id, "approve", header)).status).toBe(200);
        expect((await acao(segundo.id, "approve", sysadmin)).status).toBe(200);
    });

    it("um admin de outra empresa recebe 404, e um que já não está pendente dá 409", async () => {
        const { header, ana } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);
        const pendente = await criarAusencia(ana);
        const recusado = await criarAusencia(ana, { status: AbsenceStatus.Rejected, startDate: "2026-11-02", endDate: "2026-11-06" });

        expect((await acao(pendente.id, "approve", deFora)).status).toBe(404);
        expect((await acao(recusado.id, "approve", header)).status).toBe(409);
    });
});

describe("POST /absences/{id}/reject", () => {
    it("recusa com um motivo, que fica no pedido e vai na notificação", async () => {
        const { admin, header, ana } = await cenario();
        const pedido = await criarAusencia(ana);

        const res = await acao(pedido.id, "reject", header, { reason: "Entrega do projeto nessa semana" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            status: AbsenceStatus.Rejected,
            decidedBy: admin.id,
            decisionNote: "Entrega do projeto nessa semana",
        });
        expect(await recebidas(ana.id)).toEqual([{
            type: "absence.rejected",
            data: {
                absenceId: pedido.id,
                userId: ana.id,
                type: AbsenceType.Vacation,
                startDate: "2026-12-14",
                endDate: "2026-12-18",
                reason: "Entrega do projeto nessa semana",
            },
        }]);
    });

    it("o motivo, e o corpo, são opcionais", async () => {
        const { header, ana } = await cenario();
        const pedido = await criarAusencia(ana);

        const res = await acao(pedido.id, "reject", header);

        expect(res.status).toBe(200);
        expect(res.body.data.decisionNote).toBeNull();
    });

    it("não recusa um já aprovado", async () => {
        const { header, ana } = await cenario();
        const pedido = await criarAusencia(ana, { status: AbsenceStatus.Approved });

        expect((await acao(pedido.id, "reject", header)).status).toBe(409);
    });
});

describe("POST /absences/{id}/cancel", () => {
    it("a pessoa cancela o seu pendente, e os company_admins são avisados", async () => {
        const { admin, ana } = await cenario();
        const pedido = await criarAusencia(ana);

        const res = await acao(pedido.id, "cancel", authorization(ana));

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: AbsenceStatus.Cancelled, decidedBy: ana.id });
        expect(await tipos(admin.id)).toEqual(["absence.cancelled"]);
        expect(await tipos(ana.id)).toEqual([]);
    });

    it("a pessoa cancela um aprovado que ainda não começou, mas não um que já começou", async () => {
        const { ana } = await cenario();
        const futuro = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2099-07-06", endDate: "2099-07-10" });
        const comecado = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-01-05", endDate: "2026-01-09" });

        expect((await acao(futuro.id, "cancel", authorization(ana))).status).toBe(200);

        const res = await acao(comecado.id, "cancel", authorization(ana));
        expect(res.status).toBe(409);
        expect(res.body.message).toBe("Esta ausência já começou: só um admin a pode cancelar");
    });

    it("um admin cancela um aprovado que já começou, com motivo, e a pessoa é avisada", async () => {
        const { admin, header, ana } = await cenario();
        const pedido = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-01-05", endDate: "2026-01-09" });

        const res = await acao(pedido.id, "cancel", header, { reason: "Voltou mais cedo" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: AbsenceStatus.Cancelled, decidedBy: admin.id, decisionNote: "Voltou mais cedo" });
        expect(await recebidas(ana.id)).toEqual([{
            type: "absence.cancelled",
            data: {
                absenceId: pedido.id,
                userId: ana.id,
                type: AbsenceType.Vacation,
                startDate: "2026-01-05",
                endDate: "2026-01-09",
                reason: "Voltou mais cedo",
            },
        }]);
        expect(await tipos(admin.id)).toEqual([]);
    });

    it("um recusado ou cancelado não se cancela, e um colega recebe 404", async () => {
        const { header, ana, rui } = await cenario();
        const recusado = await criarAusencia(ana, { status: AbsenceStatus.Rejected });
        const pendente = await criarAusencia(ana, { startDate: "2026-11-02", endDate: "2026-11-06" });

        expect((await acao(recusado.id, "cancel", header)).status).toBe(409);
        expect((await acao(pendente.id, "cancel", authorization(rui))).status).toBe(404);
    });
});
