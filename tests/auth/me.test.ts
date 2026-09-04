import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { criarUtilizador } from "../helpers/factories.js";


describe("GET /auth/me", () => {
    const PASSWORD = "Password1!";
    const SEGREDO = process.env.JWT_SECRET!;

    const assinar = (claims: object, segredo = SEGREDO, opcoes = {}) =>
        jwt.sign(claims, segredo, { expiresIn: "1d", ...opcoes });

    const pedirMe = (header?: string) => {
        const pedido = request(app).get("/auth/me");
        return header === undefined ? pedido : pedido.set("Authorization", header);
    };

    it("aceita o token devolvido pelo login e identifica o utilizador", async () => {
        const utilizador = await criarUtilizador({
            email: "gabriel@empresa.pt",
            password: PASSWORD,
        });

        const login = await request(app)
            .post("/auth/login")
            .send({ email: "gabriel@empresa.pt", password: PASSWORD })
            .expect(200);

        const res = await pedirMe(`Bearer ${login.body.data.token}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 200,
            message: "Utilizador autenticado",
            data: {
                id: utilizador.id,
                companyId: utilizador.companyId,
                email: "gabriel@empresa.pt",
                role: "employee",
            },
        });

        expect(JSON.stringify(res.body)).not.toContain("$2");
    });

    it("aceita o esquema em qualquer capitalização", async () => {
        const utilizador = await criarUtilizador({ password: PASSWORD });

        await pedirMe(`bEaReR ${assinar(claimsDe(utilizador))}`).expect(200);
    });

    it.each([
        ["sem header", undefined],
        ["header vazio", ""],
        ["sem o esquema Bearer", "abc.def.ghi"],
        ["esquema errado", "Basic YWJjOjEyMw=="],
        ["Bearer sem token", "Bearer "],
    ])("devolve 401: %s", async (_nome, header) => {
        const res = await pedirMe(header);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    });

    it("devolve 401 para um token assinado com outro segredo", async () => {
        const utilizador = await criarUtilizador({ password: PASSWORD });

        const res = await pedirMe(`Bearer ${assinar(claimsDe(utilizador), "outro-segredo")}`);

        expect(res.status).toBe(401);
    });

    it("devolve 401 para um token expirado", async () => {
        const utilizador = await criarUtilizador({ password: PASSWORD });

        const res = await pedirMe(
            `Bearer ${assinar(claimsDe(utilizador), SEGREDO, { expiresIn: "-1s" })}`,
        );

        expect(res.status).toBe(401);
    });

    it.each([
        ["claim em falta", { sub: "1", companyId: 1 }],
        ["role desconhecido", { sub: "1", companyId: 1, role: "superadmin" }],
        ["companyId como string", { sub: "1", companyId: "1", role: UserRole.Employee }],
    ])("devolve 401 para um token nosso mas com %s", async (_nome, claims) => {
        const res = await pedirMe(`Bearer ${assinar(claims)}`);

        expect(res.status).toBe(401);
    });

    it("devolve 401 para um token de um utilizador que já não existe", async () => {
        const res = await pedirMe(
            `Bearer ${assinar({ sub: "999999", companyId: 1, role: UserRole.Employee })}`,
        );

        expect(res.status).toBe(401);
    });

    it.each([
        ["suspensa", { status: UserStatus.Suspended }],
        ["terminada", { status: UserStatus.Terminated }],
        ["com troca de password pendente", { mustChangePassword: true }],
    ])("devolve 403 para uma conta %s", async (_nome, opcoes) => {
        const utilizador = await criarUtilizador({ password: PASSWORD, ...opcoes });

        const res = await pedirMe(`Bearer ${assinar(claimsDe(utilizador))}`);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ status: 403, message: "Conta não está ativa" });
    });

    it("não revela ao cliente porque falhou", async () => {
        const semToken = await pedirMe();
        const tokenMau = await pedirMe("Bearer nao-e-um-jwt");

        expect(semToken.body.code).toBe(tokenMau.body.code);
        expect(JSON.stringify(tokenMau.body)).not.toContain("jwt malformed");
    });
});

function claimsDe(utilizador: { id: number; companyId: number; role: UserRole }) {
    return {
        sub: String(utilizador.id),
        companyId: utilizador.companyId,
        role: utilizador.role,
    };
}
