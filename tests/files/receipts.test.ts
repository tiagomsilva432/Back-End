import { describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { app } from "../../src/app.js";
import { StoredFile } from "../../src/entities/StoredFile.js";
import { signedFileUrl } from "../../src/services/files/signed-urls.js";
import { FileKind, UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarDespesa, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { descarregar, enviarFicheiro, fotografia, noDisco, pdf } from "../helpers/files.js";
import { repo } from "../setup/db.js";

const ficheiros = () => repo(StoredFile);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const ler = (caminho: string, header: string) => request(app).get(caminho).set("Authorization", header);

const anexar = (despesaId: string, header: string, bytes: Buffer, nome = "fatura.pdf") =>
    enviarFicheiro(`/expenses/${despesaId}/receipts`, header, bytes, nome);

/** Um company_admin, a gestora de um projeto (employee), uma colega, e uma despesa do projeto. */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const colega = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", { managerId: gestora.id });
    const despesa = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });

    return { admin, header, gestora, colega, projeto, despesa };
};

describe("POST /expenses/:id/receipts", () => {
    it("a gestora anexa um PDF: fica no disco com o id por nome, e a despesa mostra-o", async () => {
        const { admin, gestora, despesa } = await cenario();
        const bytes = pdf();

        const res = await anexar(despesa.id, authorization(gestora), bytes, "fatura_março.pdf");

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Recibo anexado" });
        expect(res.body.data).toMatchObject({
            kind: FileKind.ExpenseReceipt,
            name: "fatura_março.pdf",
            mimeType: "application/pdf",
            size: bytes.length,
            uploadedBy: gestora.id,
            duplicateOwnerIds: [],
        });

        const id = res.body.data.id as string;
        expect(await noDisco()).toEqual([`${admin.companyId}/expense_receipt/${id}.pdf`]);
        expect(await ficheiros().findOneByOrFail({ id })).toMatchObject({
            ownerId: despesa.id,
            companyId: admin.companyId,
            sha256: createHash("sha256").update(bytes).digest("hex"),
        });

        const lida = await ler(`/expenses/${despesa.id}`, authorization(gestora));
        expect(lida.body.data.receipts).toEqual([res.body.data]);
    });

    it("uma fotografia fica endireitada e sem EXIF; o hash é o do que chegou", async () => {
        const { header, despesa } = await cenario();
        const original = await fotografia(300, 200);

        const res = await anexar(despesa.id, header, original, "talao.jpg");

        expect(res.status).toBe(201);
        expect(res.body.data.mimeType).toBe("image/jpeg");

        const guardada = await descarregar(res.body.data.url);
        const meta = await sharp(guardada.body as Buffer).metadata();
        expect(meta).toMatchObject({ format: "jpeg", width: 200, height: 300 });
        expect(meta.exif).toBeUndefined();
        expect((await ficheiros().findOneByOrFail({ id: res.body.data.id })).sha256)
            .toBe(createHash("sha256").update(original).digest("hex"));
    });

    it("o tipo vê-se pelos bytes: HTML com nome de PDF é 400, e nada fica gravado", async () => {
        const { header, despesa } = await cenario();

        const res = await anexar(despesa.id, header, Buffer.from("<html><script>alert(1)</script></html>"), "recibo.pdf");

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([{ field: "file", message: "Tipo de ficheiro não aceite: usa JPG, PNG, WEBP, PDF" }]);
        expect(await noDisco()).toEqual([]);
        expect(await ficheiros().countBy({ ownerId: despesa.id })).toBe(0);
    });

    it("sem ficheiro, ou noutro campo, é 400", async () => {
        const { header, despesa } = await cenario();

        const semNada = await request(app).post(`/expenses/${despesa.id}/receipts`).set("Authorization", header);
        const outroCampo = await request(app)
            .post(`/expenses/${despesa.id}/receipts`)
            .set("Authorization", header)
            .attach("recibo", pdf(), "fatura.pdf");

        expect(semNada.status).toBe(400);
        expect(semNada.body.data).toEqual([{ field: "file", message: expect.any(String) }]);
        expect(outroCampo.status).toBe(400);
        expect(outroCampo.body.data).toEqual([{ field: "recibo", message: "Envia um só ficheiro, no campo file" }]);
    });

    it("mais de 10 MB é 413", async () => {
        const { header, despesa } = await cenario();
        const grande = Buffer.concat([pdf(), Buffer.alloc(10 * 1024 * 1024)]);

        const res = await anexar(despesa.id, header, grande);

        expect(res.status).toBe(413);
        expect(res.body.message).toBe("O ficheiro tem mais de 10 MB");
        expect(await noDisco()).toEqual([]);
    });

    it("o mesmo ficheiro duas vezes é 409, e o sexto também", async () => {
        const { header, despesa } = await cenario();

        expect((await anexar(despesa.id, header, pdf("1"))).status).toBe(201);
        const repetido = await anexar(despesa.id, header, pdf("1"), "outro-nome.pdf");
        expect(repetido.status).toBe(409);
        expect(repetido.body.message).toBe("Este ficheiro já está anexado");

        for (const n of [2, 3, 4, 5]) {
            expect((await anexar(despesa.id, header, pdf(String(n)))).status).toBe(201);
        }

        const sexto = await anexar(despesa.id, header, pdf("6"));
        expect(sexto.status).toBe(409);
        expect(await ficheiros().countBy({ ownerId: despesa.id })).toBe(5);
        expect(await noDisco()).toHaveLength(5);
    });

    it("quem não gere a despesa: uma colega recebe 403, outra empresa 404, e nada fica gravado", async () => {
        const { colega, despesa } = await cenario();
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);

        const daColega = await anexar(despesa.id, authorization(colega), pdf());
        const daOutra = await anexar(despesa.id, deFora, pdf());

        expect(daColega.status).toBe(403);
        expect(daOutra.status).toBe(404);
        expect(daOutra.body.message).toBe("Despesa não encontrada");
        expect(await noDisco()).toEqual([]);
    });

    it("sem token é 401", async () => {
        const { despesa } = await cenario();

        const res = await request(app).post(`/expenses/${despesa.id}/receipts`).attach("file", pdf(), "fatura.pdf");

        expect(res.status).toBe(401);
    });
});

describe("recibos repetidos noutras despesas", () => {
    it("o mesmo recibo em duas despesas é aceite, mas cada uma aponta para a outra", async () => {
        const { admin, header, projeto, despesa } = await cenario();
        const outra = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });

        await anexar(despesa.id, header, pdf("jantar"));
        const segundo = await anexar(outra.id, header, pdf("jantar"));

        expect(segundo.status).toBe(201);
        expect(segundo.body.data.duplicateOwnerIds).toEqual([despesa.id]);

        const primeira = await ler(`/expenses/${despesa.id}`, header);
        expect(primeira.body.data.receipts[0].duplicateOwnerIds).toEqual([outra.id]);

        const lista = await ler(`/expenses?projectId=${projeto.id}`, header);
        const avisos = Object.fromEntries(lista.body.data.map((e: { id: string; receipts: Array<{ duplicateOwnerIds: string[] }> }) =>
            [e.id, e.receipts[0]!.duplicateOwnerIds]));
        expect(avisos).toEqual({ [despesa.id]: [outra.id], [outra.id]: [despesa.id] });
    });

    it("noutra empresa o mesmo ficheiro não conta, e apagar um tira o aviso ao outro", async () => {
        const { admin, header, projeto, despesa } = await cenario();
        const outra = await criarDespesa(admin.companyId, admin.id, { projectId: projeto.id });
        const { user: alheio, header: deFora } = await createActor(UserRole.CompanyAdmin);
        const daOutraEmpresa = await criarDespesa(alheio.companyId, alheio.id);

        await anexar(despesa.id, header, pdf("jantar"));
        const deLa = await anexar(daOutraEmpresa.id, deFora, pdf("jantar"));
        expect(deLa.body.data.duplicateOwnerIds).toEqual([]);

        const segundo = await anexar(outra.id, header, pdf("jantar"));
        await request(app).delete(`/expenses/${outra.id}/receipts/${segundo.body.data.id}`).set("Authorization", header);

        const primeira = await ler(`/expenses/${despesa.id}`, header);
        expect(primeira.body.data.receipts[0].duplicateOwnerIds).toEqual([]);
    });
});

describe("GET /files/:id", () => {
    it("o link abre o ficheiro sem token, com um nome de recibo e os headers certos", async () => {
        const { header, despesa } = await cenario();
        const bytes = pdf();
        const { body } = await anexar(despesa.id, header, bytes, "fatura.pdf");
        const id = body.data.id as string;
        const nome = `recibo_${body.data.createdAt.slice(0, 10)}_${id.slice(-8)}.pdf`;

        const aberto = await descarregar(body.data.url);
        const descarregado = await descarregar(`${body.data.url}&download=1`);

        expect(aberto.status).toBe(200);
        expect(aberto.body).toEqual(bytes);
        expect(aberto.headers["content-type"]).toBe("application/pdf");
        expect(aberto.headers["content-disposition"]).toBe(`inline; filename="${nome}"; filename*=UTF-8''${nome}`);
        expect(aberto.headers["x-content-type-options"]).toBe("nosniff");
        expect(aberto.headers["cache-control"]).toMatch(/^private, max-age=\d+$/);
        // O leitor de PDF do browser não pode ficar bloqueado por um CSP.
        expect(aberto.headers["content-security-policy"]).toBeUndefined();
        expect(descarregado.headers["content-disposition"]).toMatch(/^attachment; /);
    });

    it("uma imagem vem com um CSP que não deixa correr nada", async () => {
        const { header, despesa } = await cenario();
        const { body } = await anexar(despesa.id, header, await fotografia(), "talao.jpg");

        const res = await descarregar(body.data.url);

        expect(res.headers["content-type"]).toBe("image/jpeg");
        expect(res.headers["content-security-policy"]).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    });

    it("uma assinatura mexida é 403, uma expirada também, e um ficheiro apagado 404", async () => {
        const { header, despesa } = await cenario();
        const { body } = await anexar(despesa.id, header, pdf());
        const id = body.data.id as string;

        const mexido = await request(app).get(`/files/${id}?exp=9999999999&sig=abc`);
        const expirado = await descarregar(signedFileUrl(id, Date.now() - 3 * 60 * 60 * 1000));

        expect(mexido.status).toBe(403);
        expect(mexido.body.message).toBe("Link inválido");
        expect(expirado.status).toBe(403);
        expect(expirado.body.toString()).toContain("Este link expirou");

        await request(app).delete(`/expenses/${despesa.id}/receipts/${id}`).set("Authorization", header);

        expect((await descarregar(body.data.url)).status).toBe(404);
    });
});

describe("DELETE /expenses/:id/receipts/:fileId", () => {
    it("tira-o da despesa e do disco", async () => {
        const { header, gestora, despesa } = await cenario();
        const { body } = await anexar(despesa.id, header, pdf());

        const res = await request(app)
            .delete(`/expenses/${despesa.id}/receipts/${body.data.id}`)
            .set("Authorization", authorization(gestora));

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Recibo apagado");
        expect(await noDisco()).toEqual([]);
        expect((await ler(`/expenses/${despesa.id}`, header)).body.data.receipts).toEqual([]);
    });

    it("o recibo de outra despesa é 404, e fica onde estava", async () => {
        const { admin, header, despesa } = await cenario();
        const outra = await criarDespesa(admin.companyId, admin.id);
        const { body } = await anexar(outra.id, header, pdf());

        const res = await request(app).delete(`/expenses/${despesa.id}/receipts/${body.data.id}`).set("Authorization", header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Recibo não encontrado");
        expect(await noDisco()).toHaveLength(1);
    });

    it("apagar a despesa apaga os recibos", async () => {
        const { header, despesa } = await cenario();
        await anexar(despesa.id, header, pdf("1"));
        await anexar(despesa.id, header, pdf("2"));

        const res = await request(app).delete(`/expenses/${despesa.id}`).set("Authorization", header);

        expect(res.status).toBe(200);
        expect(await ficheiros().countBy({ ownerId: despesa.id })).toBe(0);
        expect(await noDisco()).toEqual([]);
    });
});
