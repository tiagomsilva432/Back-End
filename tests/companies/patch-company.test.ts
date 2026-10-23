import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Company } from "../../src/entities/Company.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const empresas = () => repo(Company);

const alterar = (id: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).patch(`/companies/${id}`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("PATCH /companies/:id", () => {
    it("um company_admin altera a sua própria empresa", async () => {
        const { user, header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar(user.companyId, header, { name: "Novo Nome", email: "Novo@Empresa.pt" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Empresa atualizada" });
        expect(res.body.data).toMatchObject({ name: "Novo Nome", email: "novo@empresa.pt" });
        expect(await empresas().findOneBy({ id: user.companyId })).toMatchObject({ name: "Novo Nome" });
    });

    it("junta em vez de substituir: o que é omitido fica como está", async () => {
        const { user, header } = await createActor(UserRole.CompanyAdmin);
        const antes = await empresas().findOneByOrFail({ id: user.companyId });

        const res = await alterar(user.companyId, header, { country: "es" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ name: antes.name, email: antes.email, country: "ES" });
    });

    it("um null explícito limpa o email", async () => {
        const { user, header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar(user.companyId, header, { email: null });

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBeNull();
    });

    it("recusa a um company_admin alterar o NIF", async () => {
        const { user, header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar(user.companyId, header, { taxId: "500999999" });

        expect(res.status).toBe(403);
        expect(await empresas().findOneBy({ id: user.companyId })).toMatchObject({ taxId: null });
    });

    it("um system_admin altera o NIF de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();

        const res = await alterar(outra.id, header, { taxId: "500999999" });

        expect(res.status).toBe(200);
        expect(res.body.data.taxId).toBe("500999999");
    });

    it("recusa um NIF que já é de outra empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const dona = await criarEmpresa();
        await empresas().update(dona.id, { taxId: "500111111" });
        const outra = await criarEmpresa();

        const res = await alterar(outra.id, header, { taxId: "500111111" });

        expect(res.status).toBe(409);
    });

    it("aceita reenviar o NIF que a empresa já tem", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();
        await empresas().update(empresa.id, { taxId: "500222222" });

        const res = await alterar(empresa.id, header, { taxId: "500222222" });

        expect(res.status).toBe(200);
    });

    it("responde o mesmo a uma empresa alheia e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const alheia = await criarEmpresa("Alheia");

        const foraDeAlcance = await alterar(alheia.id, header, { name: "Roubada" });
        const inexistente = await alterar(randomUUID(), header, { name: "Roubada" });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(await empresas().findOneBy({ id: alheia.id })).toMatchObject({ name: "Alheia" });
    });

    it("recusa a um employee alterar a empresa", async () => {
        const { user, header } = await createActor(UserRole.Employee);

        const res = await alterar(user.companyId, header, { name: "Outro" });

        expect(res.status).toBe(403);
    });

    it("devolve 401 sem token", async () => {
        const res = await alterar(randomUUID(), undefined, { name: "Outro" });

        expect(res.status).toBe(401);
    });

    it.each([
        ["o corpo vazio", {}],
        ["o nome vazio", { name: "" }],
        ["o nome a null", { name: null }],
        ["um email inválido", { email: "nao-e-email" }],
        ["um país com 3 letras", { country: "PRT" }],
    ])("devolve 400 com %s", async (_titulo, corpo) => {
        const { user, header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar(user.companyId, header, corpo);

        expect(res.status).toBe(400);
    });
});
