import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Announcement } from "../../src/entities/Announcement.js";
import { AnnouncementRead } from "../../src/entities/AnnouncementRead.js";
import { AnnouncementScope, AnnouncementSeverity, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarAviso,
    criarEmpresa,
    criarProjeto,
    criarUtilizador,
} from "../helpers/factories.js";
import { broadcastSpy, eventsSentToUsers, sendToCompanySpy, sendToUsersSpy } from "../helpers/realtime-spy.js";
import { repo } from "../setup/db.js";

const avisos = () => repo(Announcement);
const leituras = () => repo(AnnouncementRead);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const publicar = (header: string, corpo: object) =>
    request(app).post("/announcements").set("Authorization", header).send(corpo);

const alterar = (id: string, header: string, corpo: object) =>
    request(app).patch(`/announcements/${id}`).set("Authorization", header).send(corpo);

const apagar = (id: string, header: string) =>
    request(app).delete(`/announcements/${id}`).set("Authorization", header);

const conteudo = { title: "Manutenção", body: "Sábado de manhã a plataforma vai parar." };

const emHoras = (horas: number) => new Date(Date.now() + horas * 60 * 60 * 1000);

/** Um company_admin, uma employee que gere um projeto, e outra que não gere nada. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const colega = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Website", { managerId: gestora.id });

    return { admin, header, gestora, colega, projeto };
};

describe("POST /announcements - sistema", () => {
    it("um system_admin publica para toda a gente, e o aviso vai logo para todas as ligações", async () => {
        const { user: sysadmin, header } = await createActor(UserRole.SystemAdmin);

        const res = await publicar(header, {
            scope: AnnouncementScope.System,
            ...conteudo,
            severity: AnnouncementSeverity.Critical,
            pinned: true,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            scope: AnnouncementScope.System,
            companyId: null,
            projectId: null,
            createdBy: sysadmin.id,
            title: "Manutenção",
            severity: AnnouncementSeverity.Critical,
            pinned: true,
            endsAt: null,
            active: true,
        });
        expect(broadcastSpy).toHaveBeenCalledWith("announcement", { action: "created", announcement: res.body.data });
    });

    it("recusa um company_admin e um employee", async () => {
        const { header, gestora } = await cenario();

        expect((await publicar(header, { scope: AnnouncementScope.System, ...conteudo })).status).toBe(403);
        expect((await publicar(authorization(gestora), { scope: AnnouncementScope.System, ...conteudo })).status).toBe(403);
        expect(await avisos().count()).toBe(0);
    });
});

describe("POST /announcements - empresa", () => {
    it("um company_admin publica na sua empresa, e só ela recebe o aviso", async () => {
        const { admin, header } = await cenario();

        const res = await publicar(header, { scope: AnnouncementScope.Company, ...conteudo });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ scope: AnnouncementScope.Company, companyId: admin.companyId });
        expect(sendToCompanySpy).toHaveBeenCalledWith(admin.companyId, "announcement", {
            action: "created",
            announcement: res.body.data,
        });
        expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("um company_admin não publica noutra empresa, e um employee não publica na sua", async () => {
        const { header, gestora } = await cenario();
        const outra = await criarEmpresa();

        const alheia = await publicar(header, { scope: AnnouncementScope.Company, companyId: outra.id, ...conteudo });
        const employee = await publicar(authorization(gestora), { scope: AnnouncementScope.Company, ...conteudo });

        expect(alheia.status).toBe(403);
        expect(employee.status).toBe(403);
    });

    it("um system_admin tem de dizer a empresa, e ela tem de existir", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();

        const semEmpresa = await publicar(header, { scope: AnnouncementScope.Company, ...conteudo });
        const inexistente = await publicar(header, {
            scope: AnnouncementScope.Company,
            companyId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
            ...conteudo,
        });
        const certa = await publicar(header, { scope: AnnouncementScope.Company, companyId: empresa.id, ...conteudo });

        expect(semEmpresa.status).toBe(400);
        expect(inexistente.status).toBe(404);
        expect(certa.status).toBe(201);
        expect(certa.body.data.companyId).toBe(empresa.id);
    });
});

describe("POST /announcements - projeto", () => {
    it("o gestor publica, e o aviso vai para quem está no projeto e para o gestor", async () => {
        const { admin, gestora, colega, projeto } = await cenario();
        const saiu = await ativo(admin.companyId);
        await criarAlocacao(colega.id, projeto.id);
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2020-01-01", endDate: "2020-12-31" });

        const res = await publicar(authorization(gestora), {
            scope: AnnouncementScope.Project,
            projectId: projeto.id,
            ...conteudo,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            scope: AnnouncementScope.Project,
            companyId: admin.companyId,
            projectId: projeto.id,
            createdBy: gestora.id,
        });
        const enviados = eventsSentToUsers("announcement");
        expect(enviados).toHaveLength(1);
        const [destinatarios, evento] = enviados[0]!;
        expect(destinatarios.sort()).toEqual([colega.id, gestora.id].sort());
        expect(evento).toEqual({ action: "created", announcement: res.body.data });
    });

    it("o company_admin também publica, mas uma colega que não gere o projeto não", async () => {
        const { header, colega, projeto } = await cenario();
        await criarAlocacao(colega.id, projeto.id);

        const doAdmin = await publicar(header, { scope: AnnouncementScope.Project, projectId: projeto.id, ...conteudo });
        const daColega = await publicar(authorization(colega), {
            scope: AnnouncementScope.Project,
            projectId: projeto.id,
            ...conteudo,
        });

        expect(doAdmin.status).toBe(201);
        expect(daColega.status).toBe(403);
    });

    it("um projeto de outra empresa responde 404", async () => {
        const { header } = await cenario();
        const alheio = await criarProjeto((await criarEmpresa()).id);

        const res = await publicar(header, { scope: AnnouncementScope.Project, projectId: alheio.id, ...conteudo });

        expect(res.status).toBe(404);
    });

    it("exige o projectId", async () => {
        const { header } = await cenario();

        const res = await publicar(header, { scope: AnnouncementScope.Project, ...conteudo });

        expect(res.status).toBe(400);
    });
});

describe("POST /announcements - janela", () => {
    it("um aviso agendado grava-se, mas não é empurrado agora", async () => {
        const { header } = await cenario();

        const res = await publicar(header, {
            scope: AnnouncementScope.Company,
            ...conteudo,
            startsAt: emHoras(24).toISOString(),
            endsAt: emHoras(26).toISOString(),
        });

        expect(res.status).toBe(201);
        expect(res.body.data.active).toBe(false);
        expect(sendToCompanySpy).not.toHaveBeenCalled();
    });

    it("recusa um fim antes do início, e datas sem fuso", async () => {
        const { header } = await cenario();

        const fimAntes = await publicar(header, {
            scope: AnnouncementScope.Company,
            ...conteudo,
            startsAt: emHoras(2).toISOString(),
            endsAt: emHoras(1).toISOString(),
        });
        const fimNoPassado = await publicar(header, {
            scope: AnnouncementScope.Company,
            ...conteudo,
            endsAt: emHoras(-1).toISOString(),
        });
        const semFuso = await publicar(header, { scope: AnnouncementScope.Company, ...conteudo, startsAt: "2026-11-01T08:00:00" });

        expect(fimAntes.status).toBe(400);
        expect(fimAntes.body.data).toEqual([{ field: "endsAt", message: "O fim tem de ser depois do início" }]);
        expect(fimNoPassado.status).toBe(400);
        expect(semFuso.status).toBe(400);
        expect(await avisos().count()).toBe(0);
    });

    it("recusa um scope desconhecido e um título vazio", async () => {
        const { header } = await cenario();

        expect((await publicar(header, { scope: "planeta", ...conteudo })).status).toBe(400);
        expect((await publicar(header, { scope: AnnouncementScope.Company, title: "  ", body: "x" })).status).toBe(400);
    });
});

describe("PATCH /announcements/:id", () => {
    it("o gestor altera o aviso do seu projeto, e quem o vê recebe a versão nova", async () => {
        const { admin, gestora, colega, projeto } = await cenario();
        await criarAlocacao(colega.id, projeto.id);
        const aviso = await criarAviso(admin.id, {
            scope: AnnouncementScope.Project,
            companyId: admin.companyId,
            projectId: projeto.id,
        });

        const res = await alterar(aviso.id, authorization(gestora), { title: "Novo título", pinned: true });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ id: aviso.id, title: "Novo título", pinned: true, active: true });
        expect(sendToUsersSpy).toHaveBeenCalledWith(
            expect.arrayContaining([colega.id, gestora.id]),
            "announcement",
            { action: "updated", announcement: res.body.data },
        );
    });

    it("terminar um aviso ativo também é empurrado, com active a false", async () => {
        const { admin, header } = await cenario();
        const aviso = await criarAviso(admin.id, {
            scope: AnnouncementScope.Company,
            companyId: admin.companyId,
            startsAt: emHoras(-2),
        });

        const res = await alterar(aviso.id, header, { endsAt: emHoras(-1).toISOString() });

        expect(res.status).toBe(200);
        expect(res.body.data.active).toBe(false);
        expect(sendToCompanySpy).toHaveBeenCalledWith(admin.companyId, "announcement", {
            action: "updated",
            announcement: res.body.data,
        });
    });

    it("compara a janela com o que está gravado", async () => {
        const { admin, header } = await cenario();
        const aviso = await criarAviso(admin.id, {
            scope: AnnouncementScope.Company,
            companyId: admin.companyId,
            startsAt: emHoras(1),
        });

        const res = await alterar(aviso.id, header, { endsAt: emHoras(-1).toISOString() });

        expect(res.status).toBe(400);
    });

    it("403 a quem o vê mas não o gere, 404 a quem não o vê, 400 a um PATCH vazio", async () => {
        const { admin, header, colega } = await cenario();
        const daEmpresa = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });
        const { header: alheio } = await createActor(UserRole.CompanyAdmin);
        const { user: sysadmin } = await createActor(UserRole.SystemAdmin);
        const deSistema = await criarAviso(sysadmin.id);

        expect((await alterar(daEmpresa.id, authorization(colega), { title: "x" })).status).toBe(403);
        expect((await alterar(daEmpresa.id, alheio, { title: "x" })).status).toBe(404);
        expect((await alterar(deSistema.id, header, { title: "x" })).status).toBe(403);
        expect((await alterar(daEmpresa.id, header, {})).status).toBe(400);
    });

    it("um agendado é 404 para quem não o gere, e não 403", async () => {
        const { admin, colega } = await cenario();
        const agendado = await criarAviso(admin.id, {
            scope: AnnouncementScope.Company,
            companyId: admin.companyId,
            startsAt: emHoras(5),
        });

        const res = await alterar(agendado.id, authorization(colega), { title: "x" });

        expect(res.status).toBe(404);
    });
});

describe("DELETE /announcements/:id", () => {
    it("apaga o aviso e as leituras, e quem o via recebe a remoção", async () => {
        const { admin, header, colega } = await cenario();
        const aviso = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });
        await request(app).post(`/announcements/${aviso.id}/read`).set("Authorization", authorization(colega));

        const res = await apagar(aviso.id, header);

        expect(res.status).toBe(200);
        expect(await avisos().countBy({ id: aviso.id })).toBe(0);
        expect(await leituras().countBy({ announcementId: aviso.id })).toBe(0);
        expect(sendToCompanySpy).toHaveBeenCalledWith(admin.companyId, "announcement", {
            action: "deleted",
            id: aviso.id,
        });
    });

    it("uma colega que não gere não apaga", async () => {
        const { admin, colega } = await cenario();
        const aviso = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });

        const res = await apagar(aviso.id, authorization(colega));

        expect(res.status).toBe(403);
        expect(await avisos().countBy({ id: aviso.id })).toBe(1);
    });
});

describe("GET /announcements", () => {
    const listar = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
    const ids = (res: request.Response) => res.body.data.map((a: { id: string }) => a.id).sort();

    it("um company_admin vê os da empresa e dos projetos dela, nunca os de sistema nem de outra empresa", async () => {
        const { admin, header, projeto } = await cenario();
        const { user: sysadmin } = await createActor(UserRole.SystemAdmin);
        const daEmpresa = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });
        const doProjeto = await criarAviso(admin.id, {
            scope: AnnouncementScope.Project,
            companyId: admin.companyId,
            projectId: projeto.id,
        });
        await criarAviso(sysadmin.id);
        const outra = await criarEmpresa();
        await criarAviso(sysadmin.id, { scope: AnnouncementScope.Company, companyId: outra.id });

        const res = await listar("/announcements", header);
        const soEmpresa = await listar("/announcements?scope=company", header);

        expect(res.status).toBe(200);
        expect(ids(res)).toEqual([daEmpresa.id, doProjeto.id].sort());
        expect(ids(soEmpresa)).toEqual([daEmpresa.id]);
        expect((await listar(`/announcements?companyId=${outra.id}`, header)).status).toBe(403);
    });

    it("por omissão só os ativos; includeInactive junta os agendados e os que acabaram", async () => {
        const { admin, header } = await cenario();
        const ativoAgora = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });
        const agendado = await criarAviso(admin.id, {
            scope: AnnouncementScope.Company,
            companyId: admin.companyId,
            startsAt: emHoras(3),
        });
        const acabado = await criarAviso(admin.id, {
            scope: AnnouncementScope.Company,
            companyId: admin.companyId,
            startsAt: emHoras(-3),
            endsAt: emHoras(-1),
        });

        const ativos = await listar("/announcements", header);
        const todos = await listar("/announcements?includeInactive=true", header);

        expect(ids(ativos)).toEqual([ativoAgora.id]);
        expect(ids(todos)).toEqual([ativoAgora.id, agendado.id, acabado.id].sort());
    });

    it("um employee só vê os dos projetos que gere", async () => {
        const { admin, gestora, colega, projeto } = await cenario();
        const outroProjeto = await criarProjeto(admin.companyId);
        const doSeu = await criarAviso(admin.id, {
            scope: AnnouncementScope.Project,
            companyId: admin.companyId,
            projectId: projeto.id,
        });
        await criarAviso(admin.id, {
            scope: AnnouncementScope.Project,
            companyId: admin.companyId,
            projectId: outroProjeto.id,
        });
        await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });

        expect(ids(await listar("/announcements", authorization(gestora)))).toEqual([doSeu.id]);
        expect(ids(await listar("/announcements", authorization(colega)))).toEqual([]);
    });

    it("um system_admin vê tudo e filtra por empresa", async () => {
        const { admin } = await cenario();
        const { user: sysadmin, header } = await createActor(UserRole.SystemAdmin);
        const deSistema = await criarAviso(sysadmin.id);
        const daEmpresa = await criarAviso(admin.id, { scope: AnnouncementScope.Company, companyId: admin.companyId });

        expect(ids(await listar("/announcements", header))).toEqual(expect.arrayContaining([deSistema.id, daEmpresa.id]));
        expect(ids(await listar(`/announcements?companyId=${admin.companyId}`, header))).toEqual([daEmpresa.id]);
    });
});
