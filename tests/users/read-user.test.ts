import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa, criarPerfil, criarUtilizador } from "../helpers/factories.js";

const listar = (header?: string, query = "") => {
    const pedido = request(app).get(`/users${query}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const ver = (id: string, header?: string) => {
    const pedido = request(app).get(`/users/${id}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const emailsDe = (res: { body: { data: { email: string }[] } }) =>
    res.body.data.map((u) => u.email);

describe("GET /users", () => {
    it("devolve os utilizadores da empresa de quem pergunta, por email", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarUtilizador({ companyId: empregado.companyId, email: "zulu@empresa.pt" });
        await criarUtilizador({ companyId: empregado.companyId, email: "alfa@empresa.pt" });

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Utilizadores" });

        const emails = emailsDe(res);
        expect(emails).toHaveLength(3);
        expect(emails).toEqual([...emails].sort());
        expect(emails).toContain("alfa@empresa.pt");
        expect(emails).toContain("zulu@empresa.pt");
    });

    it("não mostra os utilizadores de outra empresa", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const outra = await criarEmpresa();
        await criarUtilizador({ companyId: outra.id, email: "alheio@empresa.pt" });

        const res = await listar(header);

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(empregado.id);
    });

    it("devolve uma lista com quem pergunta quando mais ninguém existe", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(gestora.id);
    });

    it("inclui o perfil quando existe e null quando não existe", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const comPerfil = await criarUtilizador({
            companyId: gestora.companyId,
            email: "aaa@empresa.pt",
        });
        await criarPerfil(comPerfil.id, {
            firstName: "Carla",
            lastName: "Mendes",
            jobTitle: "Dev",
            phone: "+351912345678",
        });

        const res = await listar(header);

        const encontrado = res.body.data.find((u: { id: string }) => u.id === comPerfil.id);
        expect(encontrado.profile).toEqual({
            userId: comPerfil.id,
            firstName: "Carla",
            lastName: "Mendes",
            phone: "+351912345678",
            address: null,
            birthDate: null,
            hireDate: "2024-01-15",
            jobTitle: "Dev",
            avatarUrl: null,
        });

        const semPerfil = res.body.data.find((u: { id: string }) => u.id === gestora.id);
        expect(semPerfil.profile).toBeNull();
    });

    it("nunca devolve o passwordHash, o signupToken nem a sua validade", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const token = randomUUID();
        await criarUtilizador({
            companyId: gestora.companyId,
            email: "convidado@empresa.pt",
            password: "Password1!",
            signupToken: token,
            signupTokenExpiresAt: new Date(Date.now() + 86_400_000),
        });

        const res = await listar(header);
        const corpo = JSON.stringify(res.body);

        expect(corpo).not.toContain("passwordHash");
        expect(corpo).not.toContain("signupToken");
        expect(corpo).not.toContain("signupTokenExpiresAt");
        expect(corpo).not.toContain("$2");
        expect(corpo).not.toContain(token);
    });

    it("filtra por role", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        await criarUtilizador({ companyId: gestora.companyId, role: UserRole.Employee });

        const res = await listar(header, "?role=employee");

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].role).toBe("employee");
    });

    it("filtra por estado", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        await criarUtilizador({ companyId: gestora.companyId, status: UserStatus.Invited });

        const res = await listar(header, "?status=invited");

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].status).toBe("invited");
    });

    it("combina os dois filtros", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        await criarUtilizador({
            companyId: gestora.companyId,
            role: UserRole.Employee,
            status: UserStatus.Invited,
        });
        await criarUtilizador({
            companyId: gestora.companyId,
            role: UserRole.Employee,
            status: UserStatus.Suspended,
        });

        const res = await listar(header, "?role=employee&status=suspended");

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({ role: "employee", status: "suspended" });
    });

    it("um employee vê o diretório completo da sua empresa", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarUtilizador({ companyId: empregado.companyId, role: UserRole.CompanyAdmin });

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
    });

    it("um system_admin lê a empresa que indicar", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        await criarUtilizador({ companyId: outra.id, email: "alheio@empresa.pt" });

        const res = await listar(header, `?companyId=${outra.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].email).toBe("alheio@empresa.pt");
    });

    it("exige o companyId a um system_admin", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await listar(header);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([
            { field: "companyId", message: "Obrigatório para o administrador do sistema" },
        ]);
    });

    it("recusa a um company_admin ler outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await listar(header, `?companyId=${outra.id}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Só pode ver a sua empresa");
    });

    it("devolve 401 sem token", async () => {
        const res = await listar();

        expect(res.status).toBe(401);
    });

    it.each([
        ["?role=chefe", "role"],
        ["?status=desaparecido", "status"],
        ["?companyId=1", "companyId"],
    ])("devolve 400 para %s", async (query, field) => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await listar(header, query);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([{ field, message: expect.any(String) }]);
    });
});

describe("GET /users/:id", () => {
    it("devolve um utilizador da própria empresa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const colega = await criarUtilizador({ companyId: gestora.companyId });

        const res = await ver(colega.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 200,
            message: "Utilizador",
            data: { id: colega.id, companyId: gestora.companyId, profile: null },
        });
    });

    it("um employee vê um colega", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({ companyId: empregado.companyId });

        const res = await ver(colega.id, header);

        expect(res.status).toBe(200);
    });

    it("um system_admin vê o utilizador de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });

        const res = await ver(alheio.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(alheio.id);
    });

    it("responde o mesmo a um utilizador de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarUtilizador({ companyId: outra.id });

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

    it("não devolve o passwordHash nem o signupToken", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const colega = await criarUtilizador({
            companyId: gestora.companyId,
            password: "Password1!",
            signupToken: randomUUID(),
        });

        const res = await ver(colega.id, header);
        const corpo = JSON.stringify(res.body);

        expect(corpo).not.toContain("passwordHash");
        expect(corpo).not.toContain("signupToken");
        expect(corpo).not.toContain("$2");
    });

    it("devolve 401 sem token", async () => {
        const colega = await criarUtilizador();

        const res = await ver(colega.id);

        expect(res.status).toBe(401);
    });
});
