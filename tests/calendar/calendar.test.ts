import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { AbsenceStatus, AbsenceType, UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarAusencia, criarFeriado, criarProjeto, criarUtilizador } from "../helpers/factories.js";

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) =>
    request(app).get(caminho).set("Authorization", header);

const DEZEMBRO = "from=2026-12-01&to=2026-12-31";

type Entrada = { id: string; type: string; status: string };

/** Um company_admin e três pessoas da empresa. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const eva = await ativo(admin.companyId);

    return { admin, header, ana, rui, eva };
};

describe("GET /calendar", () => {
    it("traz os feriados nacionais e os da empresa do intervalo, por data", async () => {
        const { admin, header } = await cenario();
        const vespera = await criarFeriado(admin.companyId, admin.id, { date: "2026-12-24", name: "Véspera de Natal" });

        const res = await ler(`/calendar?${DEZEMBRO}`, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ companyId: admin.companyId, from: "2026-12-01", to: "2026-12-31" });
        expect(res.body.data.holidays).toEqual([
            { date: "2026-12-01", name: "Restauração da Independência", kind: "national", id: null },
            { date: "2026-12-08", name: "Imaculada Conceição", kind: "national", id: null },
            { date: "2026-12-24", name: "Véspera de Natal", kind: "company", id: vespera.id },
            { date: "2026-12-25", name: "Natal", kind: "national", id: null },
        ]);
    });

    it("um colega vê as férias como férias, e uma baixa ou uma falta só como ausência", async () => {
        const { ana, rui, eva } = await cenario();
        const ferias = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-12-21", endDate: "2026-12-31" });
        const baixa = await criarAusencia(rui, {
            type: AbsenceType.Sick,
            status: AbsenceStatus.Approved,
            startDate: "2026-12-07",
            endDate: "2026-12-09",
            note: "Gripe",
        });
        const falta = await criarAusencia(rui, { type: AbsenceType.Leave, status: AbsenceStatus.Approved, startDate: "2026-12-14", endDate: "2026-12-14" });

        const res = await ler(`/calendar?${DEZEMBRO}`, authorization(eva));

        expect(res.status).toBe(200);
        expect(res.body.data.absences).toEqual([
            { id: baixa.id, userId: rui.id, type: "absent", status: AbsenceStatus.Approved, startDate: "2026-12-07", endDate: "2026-12-09" },
            { id: falta.id, userId: rui.id, type: "absent", status: AbsenceStatus.Approved, startDate: "2026-12-14", endDate: "2026-12-14" },
            { id: ferias.id, userId: ana.id, type: AbsenceType.Vacation, status: AbsenceStatus.Approved, startDate: "2026-12-21", endDate: "2026-12-31" },
        ]);
    });

    it("a pessoa e o admin veem o tipo verdadeiro", async () => {
        const { header, rui } = await cenario();
        await criarAusencia(rui, { type: AbsenceType.Sick, status: AbsenceStatus.Approved });

        const doAdmin = await ler(`/calendar?${DEZEMBRO}`, header);
        const doProprio = await ler(`/calendar?${DEZEMBRO}`, authorization(rui));

        expect(doAdmin.body.data.absences[0].type).toBe(AbsenceType.Sick);
        expect(doProprio.body.data.absences[0].type).toBe(AbsenceType.Sick);
    });

    it("os pendentes só os vê a própria pessoa e o admin; os recusados e cancelados ninguém", async () => {
        const { header, ana, rui } = await cenario();
        const pendente = await criarAusencia(ana);
        await criarAusencia(ana, { status: AbsenceStatus.Rejected, startDate: "2026-12-21", endDate: "2026-12-23" });
        await criarAusencia(ana, { status: AbsenceStatus.Cancelled, startDate: "2026-12-28", endDate: "2026-12-30" });

        const ids = async (h: string) =>
            (await ler(`/calendar?${DEZEMBRO}`, h)).body.data.absences.map((a: Entrada) => [a.id, a.status]);

        expect(await ids(authorization(ana))).toEqual([[pendente.id, AbsenceStatus.Pending]]);
        expect(await ids(header)).toEqual([[pendente.id, AbsenceStatus.Pending]]);
        expect(await ids(authorization(rui))).toEqual([]);
    });

    it("só o que toca no intervalo, só desta empresa, e sem contas terminadas", async () => {
        const { admin, header, ana } = await cenario();
        const terminada = await criarUtilizador({ companyId: admin.companyId, status: UserStatus.Terminated });
        const { user: fora } = await createActor(UserRole.Employee);
        const ponta = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-11-30", endDate: "2026-12-01" });
        await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-11-02", endDate: "2026-11-06" });
        await criarAusencia(terminada, { status: AbsenceStatus.Approved });
        await criarAusencia(fora, { status: AbsenceStatus.Approved });

        const res = await ler(`/calendar?${DEZEMBRO}`, header);

        expect(res.body.data.absences.map((a: Entrada) => a.id)).toEqual([ponta.id]);
    });

    it("recusa um intervalo invertido, de mais de 366 dias, ou sem datas", async () => {
        const { header } = await cenario();

        expect((await ler("/calendar?from=2026-12-31&to=2026-12-01", header)).status).toBe(400);
        expect((await ler("/calendar?from=2026-01-01&to=2027-01-02", header)).status).toBe(400);
        expect((await ler("/calendar?from=2026-01-01&to=2027-01-01", header)).status).toBe(200);
        expect((await ler("/calendar?from=2026-12-01", header)).status).toBe(400);
        expect((await ler("/calendar", header)).status).toBe(400);
    });

    it("outra empresa é 403; um system_admin indica qual", async () => {
        const { admin, ana } = await cenario();
        const { user: fora } = await createActor(UserRole.CompanyAdmin);
        const { header: sysadmin } = await createActor(UserRole.SystemAdmin);
        const ferias = await criarAusencia(ana, { status: AbsenceStatus.Approved });

        expect((await ler(`/calendar?${DEZEMBRO}&companyId=${fora.companyId}`, authorization(ana))).status).toBe(403);
        expect((await ler(`/calendar?${DEZEMBRO}`, sysadmin)).status).toBe(400);

        const res = await ler(`/calendar?${DEZEMBRO}&companyId=${admin.companyId}`, sysadmin);
        expect(res.status).toBe(200);
        expect(res.body.data.absences.map((a: Entrada) => a.id)).toEqual([ferias.id]);
    });
});

describe("GET /projects/{id}/calendar", () => {
    it("só as ausências de quem está alocado em algum dia do intervalo, e do gestor", async () => {
        const { admin, ana, rui, eva } = await cenario();
        const gestor = await ativo(admin.companyId);
        const saiu = await ativo(admin.companyId);
        const projeto = await criarProjeto(admin.companyId, "Website", { managerId: gestor.id });
        await criarAlocacao(ana.id, projeto.id, { startDate: "2026-01-01" });
        // Sai a meio de dezembro: ainda conta para este intervalo.
        await criarAlocacao(rui.id, projeto.id, { startDate: "2026-01-01", endDate: "2026-12-15" });
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2026-01-01", endDate: "2026-11-30" });

        const daAna = await criarAusencia(ana, { status: AbsenceStatus.Approved, startDate: "2026-12-21", endDate: "2026-12-23" });
        const doRui = await criarAusencia(rui, { type: AbsenceType.Sick, status: AbsenceStatus.Approved, startDate: "2026-12-02", endDate: "2026-12-03" });
        const doGestor = await criarAusencia(gestor, { status: AbsenceStatus.Approved, startDate: "2026-12-28", endDate: "2026-12-30" });
        await criarAusencia(saiu, { status: AbsenceStatus.Approved });
        await criarAusencia(eva, { status: AbsenceStatus.Approved });

        const res = await ler(`/projects/${projeto.id}/calendar?${DEZEMBRO}`, authorization(eva));

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ projectId: projeto.id, companyId: admin.companyId });
        expect(res.body.data.holidays).toHaveLength(3);
        expect(res.body.data.absences.map((a: Entrada) => [a.id, a.type])).toEqual([
            [doRui.id, "absent"],
            [daAna.id, AbsenceType.Vacation],
            [doGestor.id, AbsenceType.Vacation],
        ]);
    });

    it("um projeto sem ninguém dá uma lista vazia, e um de outra empresa 404", async () => {
        const { admin, header } = await cenario();
        const vazio = await criarProjeto(admin.companyId, "Vazio");
        const { user: fora } = await createActor(UserRole.CompanyAdmin);
        const alheio = await criarProjeto(fora.companyId, "Alheio");

        const res = await ler(`/projects/${vazio.id}/calendar?${DEZEMBRO}`, header);

        expect(res.status).toBe(200);
        expect(res.body.data.absences).toEqual([]);
        expect((await ler(`/projects/${alheio.id}/calendar?${DEZEMBRO}`, header)).status).toBe(404);
    });
});
