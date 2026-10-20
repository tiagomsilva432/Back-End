import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { EmployeeProfile } from "../../src/entities/EmployeeProfile.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa, criarPerfil, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const perfis = () => repo(EmployeeProfile);

const CORPO = {
    firstName: "Carla",
    lastName: "Mendes",
    hireDate: "2026-01-15",
    phone: "+351912345678",
    address: "Rua das Flores 12, Lisboa",
    birthDate: "1995-04-02",
    jobTitle: "Backend Developer",
};

const ver = (id: string, header?: string) => {
    const pedido = request(app).get(`/users/${id}/profile`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const gravar = (id: string, header: string | undefined, corpo: object = CORPO) => {
    const pedido = request(app).put(`/users/${id}/profile`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("GET /users/:id/profile", () => {
    it("devolve o perfil completo, com as datas em YYYY-MM-DD", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarPerfil(empregado.id, {
            firstName: "Carla",
            lastName: "Mendes",
            phone: "+351912345678",
            birthDate: "1995-04-02",
            hireDate: "2024-01-15",
        });

        const res = await ver(empregado.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Perfil" });
        expect(res.body.data).toEqual({
            userId: empregado.id,
            firstName: "Carla",
            lastName: "Mendes",
            phone: "+351912345678",
            address: null,
            birthDate: "1995-04-02",
            hireDate: "2024-01-15",
            jobTitle: null,
            avatarUrl: null,
        });
    });

    it("um employee vê o perfil de um colega: ler é mais largo do que escrever", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({ companyId: empregado.companyId });
        await criarPerfil(colega.id);

        const res = await ver(colega.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data.userId).toBe(colega.id);
    });

    it("um system_admin vê qualquer perfil", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });
        await criarPerfil(alheio.id);

        const res = await ver(alheio.id, header);

        expect(res.status).toBe(200);
    });

    it("devolve 404 quando o utilizador existe mas ainda não tem perfil", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const colega = await criarUtilizador({ companyId: gestora.companyId });

        const res = await ver(colega.id, header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Perfil não encontrado");
    });

    it("responde o mesmo a um utilizador de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });
        await criarPerfil(alheio.id);

        const foraDeAlcance = await ver(alheio.id, header);
        const inexistente = await ver(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Utilizador não encontrado");
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await ver("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilizador não encontrado");
    });

    it("devolve 401 sem token", async () => {
        const colega = await criarUtilizador();

        const res = await ver(colega.id);

        expect(res.status).toBe(401);
    });
});

describe("PUT /users/:id/profile", () => {
    it("cria o perfil quando não existe", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);

        const res = await gravar(empregado.id, header);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Perfil criado" });
        expect(res.body.data).toMatchObject({
            userId: empregado.id,
            firstName: "Carla",
            lastName: "Mendes",
            hireDate: "2026-01-15",
            birthDate: "1995-04-02",
        });
        expect(await perfis().findOneBy({ userId: empregado.id })).toMatchObject({
            firstName: "Carla",
            hireDate: "2026-01-15",
        });
    });

    it("atualiza o perfil quando já existe, sem criar uma segunda linha", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarPerfil(empregado.id, { firstName: "Antiga", lastName: "Mendes" });

        const res = await gravar(empregado.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Perfil atualizado" });
        expect(res.body.data.firstName).toBe("Carla");
        // A chave primária é partilhada: continua a ser uma linha só.
        expect(await perfis().countBy({ userId: empregado.id })).toBe(1);
    });

    it("um PUT substitui: os campos omitidos ficam a null", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarPerfil(empregado.id, {
            phone: "+351900000000",
            address: "Rua Antiga 1",
            jobTitle: "Junior",
        });

        const res = await gravar(empregado.id, header, {
            firstName: "Carla",
            lastName: "Mendes",
            hireDate: "2026-01-15",
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            phone: null,
            address: null,
            jobTitle: null,
            birthDate: null,
        });
        expect(await perfis().findOneBy({ userId: empregado.id })).toMatchObject({
            phone: null,
            address: null,
            jobTitle: null,
        });
    });

    it("faz trim aos nomes", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);

        const res = await gravar(empregado.id, header, {
            firstName: "  Carla  ",
            lastName: "  Mendes  ",
            hireDate: "2026-01-15",
        });

        expect(res.body.data).toMatchObject({ firstName: "Carla", lastName: "Mendes" });
    });

    it("um company_admin edita o perfil de um colaborador da sua empresa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const colega = await criarUtilizador({ companyId: gestora.companyId });

        const res = await gravar(colega.id, header);

        expect(res.status).toBe(201);
        expect(res.body.data.userId).toBe(colega.id);
    });

    it("um company_admin edita o próprio perfil", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

        const res = await gravar(gestora.id, header);

        expect(res.status).toBe(201);
        expect(res.body.data.userId).toBe(gestora.id);
    });

    it.each([
        ["outro company_admin", UserRole.CompanyAdmin],
        ["o system_admin", UserRole.SystemAdmin],
    ])("recusa a um company_admin editar o perfil de %s da sua empresa, e não grava nada", async (_titulo, role) => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const alvo = await criarUtilizador({ companyId: gestora.companyId, role });

        const res = await gravar(alvo.id, header);

        expect(res.status).toBe(403);
        expect(await perfis().countBy({ userId: alvo.id })).toBe(0);
    });

    it("um system_admin edita qualquer perfil", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });

        const res = await gravar(alheio.id, header);

        expect(res.status).toBe(201);
    });

    it("recusa a um employee editar o perfil de um colega, e não grava nada", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({ companyId: empregado.companyId });

        const res = await gravar(colega.id, header);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Só pode alterar o seu próprio perfil");
        expect(await perfis().countBy({ userId: colega.id })).toBe(0);
    });

    it("devolve 404 a um company_admin que edita alguém de outra empresa, e não grava nada", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });

        const res = await gravar(alheio.id, header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilizador não encontrado");
        expect(await perfis().countBy({ userId: alheio.id })).toBe(0);
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await gravar("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
    });

    it.each([
        ["firstName em falta", { lastName: "Mendes", hireDate: "2026-01-15" }, "firstName"],
        ["firstName vazio", { firstName: "", lastName: "Mendes", hireDate: "2026-01-15" }, "firstName"],
        ["hireDate em falta", { firstName: "Carla", lastName: "Mendes" }, "hireDate"],
        [
            "hireDate com formato português",
            { firstName: "Carla", lastName: "Mendes", hireDate: "15/01/2026" },
            "hireDate",
        ],
        [
            "birthDate posterior ao hireDate",
            {
                firstName: "Carla",
                lastName: "Mendes",
                hireDate: "2026-01-15",
                birthDate: "2026-06-30",
            },
            "birthDate",
        ],
        [
            "firstName com mais de 100 caracteres",
            { firstName: "a".repeat(101), lastName: "Mendes", hireDate: "2026-01-15" },
            "firstName",
        ],
        [
            "avatarUrl que não é url",
            {
                firstName: "Carla",
                lastName: "Mendes",
                hireDate: "2026-01-15",
                avatarUrl: "nao-e-url",
            },
            "avatarUrl",
        ],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { user: empregado, header } = await createActor(UserRole.Employee);

        const res = await gravar(empregado.id, header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([{ field, message: expect.any(String) }]),
        );
        expect(await perfis().countBy({ userId: empregado.id })).toBe(0);
    });

    it("ignora em silêncio os campos que não conhece", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);

        const res = await gravar(empregado.id, header, {
            firstName: "Carla",
            lastName: "Mendes",
            hireDate: "2026-01-15",
            salario: 999_999,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).not.toHaveProperty("salario");
    });

    it("devolve 401 sem token", async () => {
        const colega = await criarUtilizador();

        const res = await gravar(colega.id, undefined);

        expect(res.status).toBe(401);
    });
});
