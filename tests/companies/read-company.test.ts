import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa } from "../helpers/factories.js";

const listar = (header?: string) => {
    const pedido = request(app).get("/companies");
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const ver = (id: string, header?: string) => {
    const pedido = request(app).get(`/companies/${id}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

describe("GET /companies", () => {
    it("um system_admin vê todas as empresas, por nome", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        await criarEmpresa("Zulu, Lda.");
        await criarEmpresa("Alfa, Lda.");

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Empresas" });

        const nomes: string[] = res.body.data.map((e: { name: string }) => e.name);
        expect(nomes).toEqual(expect.arrayContaining(["Alfa, Lda.", "Zulu, Lda."]));
        expect(nomes.indexOf("Alfa, Lda.")).toBeLessThan(nomes.indexOf("Zulu, Lda."));
    });

    it.each([[UserRole.CompanyAdmin], [UserRole.Employee]])(
        "devolve 403 a um %s",
        async (role) => {
            const { header } = await createActor(role);

            const res = await listar(header);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ message: "Sem permissões para esta operação" });
        },
    );

    it("devolve 401 sem token", async () => {
        expect((await listar()).status).toBe(401);
    });
});

describe("GET /companies/:id", () => {
    it("qualquer conta ativa vê a sua própria empresa", async () => {
        const empresa = await criarEmpresa("A Minha, Lda.");
        const { header } = await createActor(UserRole.Employee, empresa.id);

        const res = await ver(empresa.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Empresa" });
        expect(res.body.data).toMatchObject({ id: empresa.id, name: "A Minha, Lda." });
    });

    it("um system_admin vê qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();

        expect((await ver(outra.id, header)).status).toBe(200);
    });

    it("devolve 404 para a empresa de outra pessoa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await ver(outra.id, header);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Empresa não encontrada" });
    });

    it("devolve a mesma resposta para uma empresa inexistente", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await ver("0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", header);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Empresa não encontrada" });
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        expect((await ver("nao-e-um-uuid", header)).status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        expect((await ver("0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42")).status).toBe(401);
    });
});
