import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { AnnouncementRead } from "../../src/entities/AnnouncementRead.js";
import { AnnouncementScope, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarAviso,
    criarEmpresa,
    criarProjeto,
    criarUtilizador,
} from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const leituras = () => repo(AnnouncementRead);

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
const marcarLido = (id: string, header: string) =>
    request(app).post(`/announcements/${id}/read`).set("Authorization", header);

const ids = (res: request.Response) => res.body.data.map((a: { id: string }) => a.id);

const emHoras = (horas: number) => new Date(Date.now() + horas * 60 * 60 * 1000);

/** Um system_admin, um company_admin e uma employee da mesma empresa. */
const cenario = async () => {
    const { user: sysadmin } = await createActor(UserRole.SystemAdmin);
    const { user: admin } = await createActor(UserRole.CompanyAdmin);
    const ana = await criarUtilizador({ companyId: admin.companyId, password: "Password1!" });

    const daEmpresa = (opcoes: Parameters<typeof criarAviso>[1] = {}) =>
        criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId, ...opcoes });
    const doProjeto = (projectId: string) =>
        criarAviso(admin.id, { scope: AnnouncementScope.Project, companyId: admin.companyId, projectId });

    return { sysadmin, admin, ana, header: authorization(ana), daEmpresa, doProjeto };
};

describe("GET /announcements/mine", () => {
    it("junta os de sistema, os da empresa e os dos projetos em que a pessoa está ou que gere", async () => {
        const { sysadmin, admin, ana, header, daEmpresa, doProjeto } = await cenario();
        const alocado = await criarProjeto(admin.companyId);
        const gerido = await criarProjeto(admin.companyId, undefined, { managerId: ana.id });
        const alheio = await criarProjeto(admin.companyId);
        const antigo = await criarProjeto(admin.companyId);
        await criarAlocacao(ana.id, alocado.id);
        await criarAlocacao(ana.id, antigo.id, { startDate: "2020-01-01", endDate: "2020-12-31" });

        const visiveis = [
            await criarAviso(sysadmin.id),
            await daEmpresa(),
            await doProjeto(alocado.id),
            await doProjeto(gerido.id),
        ];
        await doProjeto(alheio.id);
        await doProjeto(antigo.id);
        await criarAviso(sysadmin.id, { scope: AnnouncementScope.Company, companyId: (await criarEmpresa()).id });

        const res = await ler("/announcements/mine", header);

        expect(res.status).toBe(200);
        expect(ids(res).sort()).toEqual(visiveis.map((a) => a.id).sort());
        expect(res.body.data.every((a: { read: boolean; active: boolean }) => !a.read && a.active)).toBe(true);
    });

    it("sem projetos, vê na mesma os de sistema e da empresa", async () => {
        const { sysadmin, header, daEmpresa } = await cenario();
        const deSistema = await criarAviso(sysadmin.id);
        const daSua = await daEmpresa();

        const res = await ler("/announcements/mine", header);

        expect(ids(res).sort()).toEqual([deSistema.id, daSua.id].sort());
    });

    it("deixa de fora os agendados e os que já acabaram", async () => {
        const { header, daEmpresa } = await cenario();
        const agora = await daEmpresa();
        await daEmpresa({ startsAt: emHoras(1) });
        await daEmpresa({ startsAt: emHoras(-3), endsAt: emHoras(-1) });

        const res = await ler("/announcements/mine", header);

        expect(ids(res)).toEqual([agora.id]);
    });

    it("põe os fixados primeiro, e depois do mais recente para o mais antigo", async () => {
        const { header, daEmpresa } = await cenario();
        const antigo = await daEmpresa({ startsAt: emHoras(-5) });
        const fixado = await daEmpresa({ startsAt: emHoras(-10), pinned: true });
        const recente = await daEmpresa({ startsAt: emHoras(-1) });

        const res = await ler("/announcements/mine", header);

        expect(ids(res)).toEqual([fixado.id, recente.id, antigo.id]);
    });

    it("marca o que já foi lido, e ?unread=true deixa só o resto", async () => {
        const { header, daEmpresa } = await cenario();
        const lido = await daEmpresa();
        const porLer = await daEmpresa();
        await marcarLido(lido.id, header);

        const todos = await ler("/announcements/mine", header);
        const soPorLer = await ler("/announcements/mine?unread=true", header);

        const lidos = Object.fromEntries(todos.body.data.map((a: { id: string; read: boolean }) => [a.id, a.read]));
        expect(lidos).toEqual({ [lido.id]: true, [porLer.id]: false });
        expect(ids(soPorLer)).toEqual([porLer.id]);
    });
});

describe("POST /announcements/:id/read", () => {
    it("marcar duas vezes guarda uma leitura só, e a de uma pessoa não conta para outra", async () => {
        const { admin, ana, header, daEmpresa } = await cenario();
        const aviso = await daEmpresa();

        const primeira = await marcarLido(aviso.id, header);
        const segunda = await marcarLido(aviso.id, header);

        expect(primeira.status).toBe(200);
        expect(primeira.body.data).toMatchObject({ id: aviso.id, read: true });
        expect(segunda.status).toBe(200);
        expect(await leituras().findBy({ announcementId: aviso.id })).toEqual([
            expect.objectContaining({ userId: ana.id }),
        ]);

        const doAdmin = await ler("/announcements/mine", authorization(admin));
        expect(doAdmin.body.data[0]).toMatchObject({ id: aviso.id, read: false });
    });

    it("responde 404 a um aviso de outra empresa e a um agendado", async () => {
        const { sysadmin, header, daEmpresa } = await cenario();
        const alheio = await criarAviso(sysadmin.id, { scope: AnnouncementScope.Company, companyId: (await criarEmpresa()).id });
        const agendado = await daEmpresa({ startsAt: emHoras(2) });

        expect((await marcarLido(alheio.id, header)).status).toBe(404);
        expect((await marcarLido(agendado.id, header)).status).toBe(404);
        expect(await leituras().count()).toBe(0);
    });
});

describe("GET /announcements/:id", () => {
    it("um agendado só existe para quem o gere", async () => {
        const { admin, header, daEmpresa } = await cenario();
        const agendado = await daEmpresa({ startsAt: emHoras(2) });

        const daEmployee = await ler(`/announcements/${agendado.id}`, header);
        const doAdmin = await ler(`/announcements/${agendado.id}`, authorization(admin));

        expect(daEmployee.status).toBe(404);
        expect(doAdmin.status).toBe(200);
        expect(doAdmin.body.data).toMatchObject({ id: agendado.id, active: false, read: false });
    });

    it("um id que não é uuid responde 404", async () => {
        const { header } = await cenario();

        expect((await ler("/announcements/nao-e-um-id", header)).status).toBe(404);
    });
});

describe("GET /projects/:id/announcements", () => {
    it("qualquer pessoa da empresa vê os avisos ativos do projeto, mesmo sem estar nele", async () => {
        const { admin, header, doProjeto } = await cenario();
        const projeto = await criarProjeto(admin.companyId);
        const outro = await criarProjeto(admin.companyId);
        const aviso = await doProjeto(projeto.id);
        await doProjeto(outro.id);

        const res = await ler(`/projects/${projeto.id}/announcements`, header);

        expect(res.status).toBe(200);
        expect(ids(res)).toEqual([aviso.id]);
    });

    it("includeInactive só conta para quem gere o projeto", async () => {
        const { admin, ana, header } = await cenario();
        const projeto = await criarProjeto(admin.companyId);
        const gerido = await criarProjeto(admin.companyId, undefined, { managerId: ana.id });
        const doProjeto = (projectId: string, startsAt: Date) =>
            criarAviso(admin.id, { scope: AnnouncementScope.Project, companyId: admin.companyId, projectId, startsAt });
        await doProjeto(projeto.id, emHoras(4));
        const agendadoGerido = await doProjeto(gerido.id, emHoras(4));

        const naoGere = await ler(`/projects/${projeto.id}/announcements?includeInactive=true`, header);
        const gere = await ler(`/projects/${gerido.id}/announcements?includeInactive=true`, header);

        expect(ids(naoGere)).toEqual([]);
        expect(ids(gere)).toEqual([agendadoGerido.id]);
    });

    it("um projeto de outra empresa responde 404", async () => {
        const { header } = await cenario();
        const alheio = await criarProjeto((await criarEmpresa()).id);

        expect((await ler(`/projects/${alheio.id}/announcements`, header)).status).toBe(404);
    });
});
