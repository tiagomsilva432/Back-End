import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { ProjectResource } from "../../src/entities/ProjectResource.js";
import { StoredFile } from "../../src/entities/StoredFile.js";
import { FileKind, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarAlocacao, criarProjeto, criarRecurso, criarUtilizador } from "../helpers/factories.js";
import { enviarFicheiro, noDisco, pdf, png } from "../helpers/files.js";
import { repo } from "../setup/db.js";

const recursos = () => repo(ProjectResource);
const ficheiros = () => repo(StoredFile);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);
const criar = (projetoId: string, header: string, body: object) =>
    request(app).post(`/projects/${projetoId}/resources`).set("Authorization", header).send(body);
const alterar = (projetoId: string, recursoId: string, header: string, body: object) =>
    request(app).patch(`/projects/${projetoId}/resources/${recursoId}`).set("Authorization", header).send(body);
const apagar = (caminho: string, header: string) => request(app).delete(caminho).set("Authorization", header);
const enviar = (projetoId: string, recursoId: string, header: string, bytes: Buffer, nome = "arquitetura.pdf") =>
    enviarFicheiro(`/projects/${projetoId}/resources/${recursoId}/file`, header, bytes, nome, "put");

const ids = (res: request.Response) => res.body.data.map((r: { id: string }) => r.id);

/**
 * Um company_admin, a gestora do projeto (employee), a Ana e o Rui (alocados),
 * e a Sara, da mesma empresa mas fora do projeto.
 */
const cenario = async () => {
    const { user: admin, header: adminHeader } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    const sara = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id });
    await criarAlocacao(ana.id, projeto.id);
    await criarAlocacao(rui.id, projeto.id);

    return { admin, adminHeader, gestora, ana, rui, sara, projeto };
};

describe("GET /projects/:id/resources", () => {
    it("quem está no projeto, a gestora e os admins leem, do mais antigo para o mais recente", async () => {
        const { admin, adminHeader, gestora, ana, projeto } = await cenario();
        const { header: sysHeader } = await createActor(UserRole.SystemAdmin);
        const repositorio = await criarRecurso(projeto.id, ana.id, { title: "Repositório" });
        const testes = await criarRecurso(projeto.id, gestora.id, {
            title: "Servidor de testes",
            url: "https://teste.exemplo.pt",
            note: "Login: pedir à gestora",
        });
        await criarRecurso((await criarProjeto(admin.companyId)).id, admin.id);

        for (const header of [authorization(ana), authorization(gestora), adminHeader, sysHeader]) {
            const res = await ler(`/projects/${projeto.id}/resources`, header);

            expect(res.status).toBe(200);
            expect(ids(res)).toEqual([repositorio.id, testes.id]);
        }

        const res = await ler(`/projects/${projeto.id}/resources`, authorization(ana));
        expect(res.body.data[1]).toEqual({
            id: testes.id,
            projectId: projeto.id,
            title: "Servidor de testes",
            url: "https://teste.exemplo.pt",
            note: "Login: pedir à gestora",
            file: null,
            createdBy: gestora.id,
            createdAt: testes.createdAt.toISOString(),
            updatedAt: testes.updatedAt.toISOString(),
        });
    });

    it("alguém da empresa fora do projeto recebe 403; de outra empresa, 404", async () => {
        const { sara, projeto } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);

        const daEmpresa = await ler(`/projects/${projeto.id}/resources`, authorization(sara));
        const deOutra = await ler(`/projects/${projeto.id}/resources`, deFora);

        expect(daEmpresa.status).toBe(403);
        expect(daEmpresa.body.message).toBe("Só quem está no projeto vê os recursos");
        expect(deOutra.status).toBe(404);
    });

    it("uma alocação que já terminou tira o acesso; uma que acaba no futuro ainda não", async () => {
        const { admin, projeto } = await cenario();
        const saiu = await ativo(admin.companyId);
        const sai = await ativo(admin.companyId);
        await criarAlocacao(saiu.id, projeto.id, { startDate: "2025-01-01", endDate: "2025-12-31" });
        await criarAlocacao(sai.id, projeto.id, { endDate: "2099-12-31" });

        expect((await ler(`/projects/${projeto.id}/resources`, authorization(saiu))).status).toBe(403);
        expect((await ler(`/projects/${projeto.id}/resources`, authorization(sai))).status).toBe(200);
    });
});

describe("POST /projects/:id/resources", () => {
    it("quem está no projeto adiciona um link com nota", async () => {
        const { ana, projeto } = await cenario();

        const res = await criar(projeto.id, authorization(ana), {
            title: "  Repositório  ",
            url: "https://github.com/empresa/portal",
            note: "Branch principal: main",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Recurso adicionado" });
        expect(res.body.data).toMatchObject({
            projectId: projeto.id,
            title: "Repositório",
            url: "https://github.com/empresa/portal",
            note: "Branch principal: main",
            file: null,
            createdBy: ana.id,
        });
        expect(await recursos().countBy({ projectId: projeto.id })).toBe(1);
    });

    it("só o título é obrigatório: o ficheiro pode vir depois", async () => {
        const { ana, projeto } = await cenario();

        const res = await criar(projeto.id, authorization(ana), { title: "Diagrama da arquitetura" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ url: null, note: null, file: null });
    });

    it("o link tem de ser http ou https", async () => {
        const { ana, projeto } = await cenario();

        for (const url of ["javascript:alert(1)", "ftp://ficheiros.exemplo.pt", "não é um link"]) {
            const res = await criar(projeto.id, authorization(ana), { title: "Link", url });

            expect(res.status).toBe(400);
            expect(res.body.data).toEqual([{ field: "url", message: "Link inválido: use um endereço que comece por http:// ou https://" }]);
        }

        expect(await recursos().countBy({ projectId: projeto.id })).toBe(0);
    });

    it("sem título é 400", async () => {
        const { ana, projeto } = await cenario();

        const res = await criar(projeto.id, authorization(ana), { title: "   ", url: "https://exemplo.pt" });

        expect(res.status).toBe(400);
        expect(res.body.data[0].field).toBe("title");
    });

    it("alguém da empresa fora do projeto não adiciona", async () => {
        const { sara, projeto } = await cenario();

        const res = await criar(projeto.id, authorization(sara), { title: "Repositório", url: "https://github.com" });

        expect(res.status).toBe(403);
        expect(await recursos().countBy({ projectId: projeto.id })).toBe(0);
    });
});

describe("PATCH /projects/:id/resources/:resourceId", () => {
    it("quem o adicionou altera: um null limpa, o que fica de fora não muda", async () => {
        const { ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id, { title: "Repo", note: "Pedir acesso" });

        const res = await alterar(projeto.id, recurso.id, authorization(ana), { title: "Repositório", url: null });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ title: "Repositório", url: null, note: "Pedir acesso" });
        expect(await recursos().findOneByOrFail({ id: recurso.id })).toMatchObject({ title: "Repositório", url: null });
    });

    it("outro membro não altera o que não adicionou; a gestora e um admin alteram qualquer um", async () => {
        const { adminHeader, gestora, ana, rui, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);

        const doRui = await alterar(projeto.id, recurso.id, authorization(rui), { title: "Do Rui" });
        const daGestora = await alterar(projeto.id, recurso.id, authorization(gestora), { title: "Da gestora" });
        const doAdmin = await alterar(projeto.id, recurso.id, adminHeader, { title: "Do admin" });

        expect(doRui.status).toBe(403);
        expect(doRui.body.message).toBe("Só pode alterar os recursos que adicionou");
        expect(daGestora.status).toBe(200);
        expect(doAdmin.status).toBe(200);
        expect((await recursos().findOneByOrFail({ id: recurso.id })).title).toBe("Do admin");
    });

    it("um recurso de outro projeto, ou um id que não é uuid, é 404", async () => {
        const { admin, ana, projeto } = await cenario();
        const outro = await criarProjeto(admin.companyId);
        const alheio = await criarRecurso(outro.id, admin.id);

        const deOutro = await alterar(projeto.id, alheio.id, authorization(ana), { title: "Meu" });
        const invalido = await alterar(projeto.id, "nao-e-um-uuid", authorization(ana), { title: "Meu" });

        expect(deOutro.status).toBe(404);
        expect(deOutro.body.message).toBe("Recurso não encontrado");
        expect(invalido.status).toBe(404);
    });

    it("um corpo vazio é 400", async () => {
        const { ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);

        expect((await alterar(projeto.id, recurso.id, authorization(ana), {})).status).toBe(400);
    });
});

describe("DELETE /projects/:id/resources/:resourceId", () => {
    it("as mesmas regras: o Rui não apaga o da Ana; a Ana e a gestora apagam", async () => {
        const { gestora, ana, rui, projeto } = await cenario();
        const daAna = await criarRecurso(projeto.id, ana.id);
        const outroDaAna = await criarRecurso(projeto.id, ana.id);
        const caminho = (id: string) => `/projects/${projeto.id}/resources/${id}`;

        expect((await apagar(caminho(daAna.id), authorization(rui))).status).toBe(403);
        expect((await apagar(caminho(daAna.id), authorization(ana))).status).toBe(200);
        expect((await apagar(caminho(outroDaAna.id), authorization(gestora))).status).toBe(200);
        expect(await recursos().countBy({ projectId: projeto.id })).toBe(0);
    });
});

describe("O ficheiro de um recurso", () => {
    it("quem adicionou o recurso envia um PDF, e o recurso passa a mostrá-lo", async () => {
        const { admin, ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id, { url: null });

        const res = await enviar(projeto.id, recurso.id, authorization(ana), pdf("arquitetura"));

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Ficheiro anexado" });
        expect(res.body.data).toMatchObject({
            kind: FileKind.ProjectResourceFile,
            name: "arquitetura.pdf",
            mimeType: "application/pdf",
            uploadedBy: ana.id,
        });
        expect(await noDisco()).toEqual([`${admin.companyId}/resource_file/${res.body.data.id}.pdf`]);

        const lista = await ler(`/projects/${projeto.id}/resources`, authorization(ana));
        expect(lista.body.data[0].file).toEqual(res.body.data);
    });

    it("um segundo ficheiro substitui o primeiro, na base de dados e no disco", async () => {
        const { admin, ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);

        const primeiro = await enviar(projeto.id, recurso.id, authorization(ana), pdf("v1"));
        const segundo = await enviar(projeto.id, recurso.id, authorization(ana), await png(), "ecra.png");

        expect(segundo.status).toBe(201);
        expect(await ficheiros().countBy({ ownerId: recurso.id })).toBe(1);
        expect(await ficheiros().findOneBy({ id: primeiro.body.data.id })).toBeNull();
        expect(await noDisco()).toEqual([`${admin.companyId}/resource_file/${segundo.body.data.id}.png`]);
    });

    it("o tipo vê-se pelos bytes: HTML é 400", async () => {
        const { ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);

        const res = await enviar(projeto.id, recurso.id, authorization(ana), Buffer.from("<html></html>"), "notas.pdf");

        expect(res.status).toBe(400);
        expect(await noDisco()).toEqual([]);
    });

    it("quem não pode alterar o recurso não envia: outro membro 403, alguém fora do projeto 403", async () => {
        const { ana, rui, sara, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);

        expect((await enviar(projeto.id, recurso.id, authorization(rui), pdf())).status).toBe(403);
        expect((await enviar(projeto.id, recurso.id, authorization(sara), pdf())).status).toBe(403);
        expect(await noDisco()).toEqual([]);
    });

    it("apagar o ficheiro deixa o recurso; sem ficheiro, é 404", async () => {
        const { gestora, ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);
        await enviar(projeto.id, recurso.id, authorization(ana), pdf());
        const caminho = `/projects/${projeto.id}/resources/${recurso.id}/file`;

        const res = await apagar(caminho, authorization(gestora));
        const outraVez = await apagar(caminho, authorization(gestora));

        expect(res.status).toBe(200);
        expect(outraVez.status).toBe(404);
        expect(outraVez.body.message).toBe("Este recurso não tem ficheiro");
        expect(await noDisco()).toEqual([]);
        expect((await ler(`/projects/${projeto.id}/resources`, authorization(ana))).body.data[0].file).toBeNull();
    });

    it("apagar o recurso apaga o ficheiro", async () => {
        const { ana, projeto } = await cenario();
        const recurso = await criarRecurso(projeto.id, ana.id);
        await enviar(projeto.id, recurso.id, authorization(ana), pdf());

        const res = await apagar(`/projects/${projeto.id}/resources/${recurso.id}`, authorization(ana));

        expect(res.status).toBe(200);
        expect(await ficheiros().countBy({ ownerId: recurso.id })).toBe(0);
        expect(await noDisco()).toEqual([]);
    });
});
