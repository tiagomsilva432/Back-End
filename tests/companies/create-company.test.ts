import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Company } from "../../src/entities/Company.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const companies = () => repo(Company);

const criar = (header: string | undefined, corpo: object) => {
    const pedido = request(app).post("/companies");
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("POST /companies", () => {
    it("um system_admin cria a empresa e grava-a na base de dados", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, {
            name: "  Os Silvas, Lda.  ",
            taxId: "500123456",
            email: "  GERAL@OsSilvas.pt ",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Empresa criada" });
        expect(res.body.data).toMatchObject({
            name: "Os Silvas, Lda.",
            taxId: "500123456",
            email: "geral@ossilvas.pt",
            country: "PT",
        });

        expect(await companies().findOneBy({ taxId: "500123456" })).toMatchObject({
            name: "Os Silvas, Lda.",
            country: "PT",
        });
    });

    it("assume PT quando o país não é indicado", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { name: "Sem País, Lda." });

        expect(res.status).toBe(201);
        expect(res.body.data.country).toBe("PT");
    });

    it("devolve 409 quando o NIF já existe", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        await criar(header, { name: "Primeira", taxId: "999888777" }).expect(201);

        const res = await criar(header, { name: "Segunda", taxId: "999888777" });

        expect(res.status).toBe(409);
        expect(await companies().countBy({ taxId: "999888777" })).toBe(1);
    });

    it("devolve 401 sem token", async () => {
        const res = await criar(undefined, { name: "Anónima" });

        expect(res.status).toBe(401);
        expect(await companies().countBy({ name: "Anónima" })).toBe(0);
    });

    it.each([[UserRole.CompanyAdmin], [UserRole.Employee]])(
        "devolve 403 a um %s",
        async (role) => {
            const empresa = await criarEmpresa();
            const { header } = await createActor(role, empresa.id);

            const res = await criar(header, { name: "Proibida" });

            expect(res.status).toBe(403);
            expect(await companies().countBy({ name: "Proibida" })).toBe(0);
        },
    );

    it("autentica antes de validar o corpo", async () => {
        const res = await criar(undefined, { name: "" });

        expect(res.status).toBe(401);
    });

    it.each([
        ["nome vazio", { name: "   " }, "name"],
        ["país com três letras", { name: "Boa", country: "PRT" }, "country"],
        ["email sem @", { name: "Boa", email: "isto-nao-e-um-email" }, "email"],
    ])("devolve 400 quando: %s", async (_nome, corpo, campoComErro) => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: campoComErro })]),
        );
    });
});
