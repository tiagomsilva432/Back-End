import { describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import request from "supertest";
import { app } from "../../src/app.js";
import { FileKind, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarPerfil, criarUtilizador } from "../helpers/factories.js";
import { descarregar, enviarFicheiro, noDisco, pdf, png } from "../helpers/files.js";

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

const enviarAvatar = (userId: string, header: string, bytes: Buffer, nome = "eu.png") =>
    enviarFicheiro(`/users/${userId}/avatar`, header, bytes, nome, "put");

/** Uma employee com perfil, um colega, e o company_admin deles. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await ativo(admin.companyId);
    const rui = await ativo(admin.companyId);
    await criarPerfil(ana.id, { firstName: "Ana" });

    return { admin, header, ana, rui };
};

describe("PUT /users/:id/avatar", () => {
    it("fica um quadrado de 512 em WebP, e aparece no perfil, no utilizador e no diretório", async () => {
        const { ana, rui } = await cenario();

        const res = await enviarAvatar(ana.id, authorization(ana), await png("#2e86de", 900));

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Avatar atualizado" });
        expect(res.body.data).toMatchObject({ kind: FileKind.Avatar, mimeType: "image/webp", name: "eu.png" });

        const imagem = await descarregar(res.body.data.url);
        expect(await sharp(imagem.body as Buffer).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 });

        // Um colega vê-o: ler um perfil é para toda a empresa.
        const url = res.body.data.url as string;
        expect((await ler(`/users/${ana.id}/profile`, authorization(rui))).body.data.avatarUrl).toBe(url);
        expect((await ler(`/users/${ana.id}`, authorization(rui))).body.data.profile.avatarUrl).toBe(url);
        const diretorio = await ler("/users", authorization(rui));
        expect(diretorio.body.data.find((u: { id: string }) => u.id === ana.id).profile.avatarUrl).toBe(url);
    });

    it("um segundo substitui o primeiro, e o antigo sai do disco", async () => {
        const { ana } = await cenario();

        const primeiro = await enviarAvatar(ana.id, authorization(ana), await png("#111111"));
        const segundo = await enviarAvatar(ana.id, authorization(ana), await png("#eeeeee"));

        expect(segundo.status).toBe(201);
        expect(await noDisco()).toEqual([`${ana.companyId}/avatar/${segundo.body.data.id}.webp`]);
        expect((await descarregar(primeiro.body.data.url)).status).toBe(404);
        expect((await ler(`/users/${ana.id}/profile`, authorization(ana))).body.data.avatarUrl)
            .toBe(segundo.body.data.url);
    });

    it("um colega recebe 403; o admin da empresa pode", async () => {
        const { header, ana, rui } = await cenario();

        const doColega = await enviarAvatar(ana.id, authorization(rui), await png());
        const doAdmin = await enviarAvatar(ana.id, header, await png());

        expect(doColega.status).toBe(403);
        expect(doAdmin.status).toBe(201);
    });

    it("um PDF não é um avatar: 400", async () => {
        const { ana } = await cenario();

        const res = await enviarAvatar(ana.id, authorization(ana), pdf(), "eu.pdf");

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([{ field: "file", message: "Tipo de ficheiro não aceite: use JPG, PNG, WEBP" }]);
    });

    it("o PUT do perfil não lhe toca", async () => {
        const { ana } = await cenario();
        const { body } = await enviarAvatar(ana.id, authorization(ana), await png());

        const res = await request(app)
            .put(`/users/${ana.id}/profile`)
            .set("Authorization", authorization(ana))
            .send({ firstName: "Ana", lastName: "Silva", hireDate: "2024-01-15", avatarUrl: "https://exemplo.pt/x.png" });

        expect(res.status).toBe(200);
        expect(res.body.data.avatarUrl).toBe(body.data.url);
    });
});

describe("DELETE /users/:id/avatar", () => {
    it("apaga-o, e sem avatar é 404", async () => {
        const { ana } = await cenario();
        await enviarAvatar(ana.id, authorization(ana), await png());

        const apagado = await request(app).delete(`/users/${ana.id}/avatar`).set("Authorization", authorization(ana));
        const outraVez = await request(app).delete(`/users/${ana.id}/avatar`).set("Authorization", authorization(ana));

        expect(apagado.status).toBe(200);
        expect(await noDisco()).toEqual([]);
        expect((await ler(`/users/${ana.id}/profile`, authorization(ana))).body.data.avatarUrl).toBeNull();
        expect(outraVez.status).toBe(404);
        expect(outraVez.body.message).toBe("Este utilizador não tem avatar");
    });
});
