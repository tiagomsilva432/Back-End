import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Company } from "../../src/entities/Company.js";
import { CompanyHoliday } from "../../src/entities/CompanyHoliday.js";
import { UserRole } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarFeriado, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const feriados = () => repo(CompanyHoliday);

const ativo = (companyId: string, role = UserRole.Employee) =>
    criarUtilizador({ companyId, role, password: "Password1!", mustChangePassword: false });

const juntar = (header: string, corpo: object) =>
    request(app).post("/holidays").set("Authorization", header).send(corpo);

const apagar = (id: string, header: string) =>
    request(app).delete(`/holidays/${id}`).set("Authorization", header);

const listar = (header: string, query = "") =>
    request(app).get(`/holidays${query}`).set("Authorization", header);

const santoAntonio = { date: "2026-06-13", name: "Santo António" };

describe("GET /holidays", () => {
    it("qualquer pessoa da empresa vê os nacionais e os da empresa de um ano, por data", async () => {
        const { user: admin } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const proprio = await criarFeriado(admin.companyId, admin.id, santoAntonio);
        await criarFeriado(admin.companyId, admin.id, { date: "2027-02-09", name: "Carnaval" });

        const res = await listar(authorization(ana), "?year=2026");

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(14);
        expect(res.body.data).toContainEqual({ ...santoAntonio, kind: "company", id: proprio.id });
        expect(res.body.data[0]).toEqual({ date: "2026-01-01", name: "Ano Novo", kind: "national", id: null });
    });

    it("uma empresa de fora de Portugal só tem os seus", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        await repo(Company).update(admin.companyId, { country: "ES" });
        await criarFeriado(admin.companyId, admin.id, { date: "2026-10-12", name: "Fiesta Nacional" });

        const res = await listar(header, "?year=2026");

        expect(res.body.data.map((f: { name: string }) => f.name)).toEqual(["Fiesta Nacional"]);
    });
});

describe("POST /holidays", () => {
    it("um company_admin junta um à sua empresa", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);

        const res = await juntar(header, santoAntonio);

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ ...santoAntonio, companyId: admin.companyId, createdBy: admin.id });
    });

    it("recusa um dia que já é feriado nacional, ou que a empresa já tem", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        await criarFeriado(admin.companyId, admin.id, santoAntonio);

        const nacional = await juntar(header, { date: "2026-12-25", name: "Natal outra vez" });
        const repetido = await juntar(header, { ...santoAntonio, name: "Outro nome" });

        expect(nacional.status).toBe(409);
        expect(nacional.body.message).toBe("Esse dia já é feriado nacional");
        expect(repetido.status).toBe(409);
        expect(await feriados().count()).toBe(1);
    });

    it("um employee não junta, e um company_admin não junta noutra empresa", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const { user: fora } = await createActor(UserRole.CompanyAdmin);

        expect((await juntar(authorization(ana), santoAntonio)).status).toBe(403);
        expect((await juntar(header, { ...santoAntonio, companyId: fora.companyId })).status).toBe(403);
        expect(await feriados().count()).toBe(0);
    });

    it("um system_admin tem de indicar a empresa", async () => {
        const { user: admin } = await createActor(UserRole.CompanyAdmin);
        const { header } = await createActor(UserRole.SystemAdmin);

        expect((await juntar(header, santoAntonio)).status).toBe(400);
        expect((await juntar(header, { ...santoAntonio, companyId: admin.companyId })).status).toBe(201);
    });

    it("recusa uma data inválida e um nome vazio", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        expect((await juntar(header, { date: "2026-02-30", name: "Nunca" })).status).toBe(400);
        expect((await juntar(header, { date: "2026-06-13", name: "  " })).status).toBe(400);
    });
});

describe("DELETE /holidays/{id}", () => {
    it("um company_admin apaga um da sua empresa; de outra empresa é 404, e um employee 403", async () => {
        const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
        const ana = await ativo(admin.companyId);
        const { header: deFora } = await createActor(UserRole.CompanyAdmin);
        const feriado = await criarFeriado(admin.companyId, admin.id, santoAntonio);

        expect((await apagar(feriado.id, authorization(ana))).status).toBe(403);
        expect((await apagar(feriado.id, deFora)).status).toBe(404);
        expect((await apagar(feriado.id, header)).status).toBe(200);
        expect(await feriados().count()).toBe(0);
        expect((await apagar(feriado.id, header)).status).toBe(404);
    });
});
