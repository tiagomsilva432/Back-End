import { afterEach, describe, expect, it } from "@jest/globals";
import type { Response } from "express";
import request from "supertest";
import { QueryFailedError } from "typeorm";
import { app } from "../src/app.js";
import { HttpError } from "../src/dtos/common/errors-dto.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { UserRole } from "../src/types/enums.js";
import { createActor } from "./helpers/auth.js";

// O resto da suite corre em NODE_ENV=test, onde os details passam sempre.
const emProducao = async (corpo: () => Promise<void>) => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
        await corpo();
    } finally {
        process.env.NODE_ENV = anterior;
    }
};

afterEach(() => {
    process.env.NODE_ENV = "test";
});

/** Um res suficiente para o HttpResponse.send. */
const resFalso = () => {
    const gravado: { status?: number; body?: Record<string, unknown> } = {};
    const res = {
        status(code: number) {
            gravado.status = code;
            return res;
        },
        json(body: Record<string, unknown>) {
            gravado.body = body;
            return res;
        },
    };
    return { res: res as unknown as Response, gravado };
};

const lancar = (erro: HttpError) => {
    const { res, gravado } = resFalso();
    errorHandler(erro, {} as never, res, (() => {}) as never);
    return gravado;
};

describe("errorHandler: os details de um 4xx chegam sempre ao cliente", () => {
    it("devolve os erros de campo de um 400 mesmo em produção", async () => {
        await emProducao(async () => {
            const res = await request(app)
                .post("/auth/login")
                .send({ email: "sem-arroba", password: "" });

            expect(res.status).toBe(400);
            // Sem isto o frontend não sabe que campo assinalar.
            expect(res.body.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: "email" }),
                    expect.objectContaining({ field: "password" }),
                ]),
            );
        });
    });

    it("devolve os erros de query de um 400 mesmo em produção", async () => {
        await emProducao(async () => {
            const { header } = await createActor(UserRole.CompanyAdmin);

            const res = await request(app)
                .get("/users?role=chefe")
                .set("Authorization", header);

            expect(res.status).toBe(400);
            expect(res.body.data).toEqual([
                { field: "role", message: expect.any(String) },
            ]);
        });
    });

    it("devolve o campo em falta do company-scope mesmo em produção", async () => {
        await emProducao(async () => {
            const { header } = await createActor(UserRole.SystemAdmin);

            const res = await request(app).get("/users").set("Authorization", header);

            expect(res.status).toBe(400);
            expect(res.body.data).toEqual([
                { field: "companyId", message: "Obrigatório para o administrador do sistema" },
            ]);
        });
    });

    it("um 4xx sem details continua a responder sem data", () => {
        process.env.NODE_ENV = "production";

        const gravado = lancar(new HttpError(404, "Utilizador não encontrado"));

        expect(gravado.status).toBe(404);
        expect(gravado.body).toMatchObject({ status: 404, data: undefined });
    });
});

describe("errorHandler: o que chega mal formado é 4xx, não 500", () => {
    it("um corpo que não é JSON é 400", async () => {
        const res = await request(app)
            .post("/auth/login")
            .set("Content-Type", "application/json")
            .send('{"email": ');

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ status: 400, message: "O pedido não é JSON válido" });
    });

    it("um corpo acima do limite do express.json() é 413", async () => {
        const res = await request(app).post("/auth/login").send({ email: "a".repeat(200_000), password: "x" });

        expect(res.status).toBe(413);
    });

    it("um multipart sem boundary é 400 no campo file", async () => {
        const { user, header } = await createActor(UserRole.Employee);

        const res = await request(app)
            .put(`/users/${user.id}/avatar`)
            .set("Authorization", header)
            .set("Content-Type", "multipart/form-data")
            .send("isto não é um formulário");

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([{ field: "file", message: "O ficheiro não chegou completo. Tente enviar outra vez" }]);
    });

    it("um índice único que trava um pedido concorrente é 409", () => {
        const { res, gravado } = resFalso();
        const duplicado = new QueryFailedError(
            "INSERT INTO ...",
            [],
            Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
        );

        errorHandler(duplicado, {} as never, res, (() => {}) as never);

        expect(gravado.status).toBe(409);
        expect(gravado.body).toMatchObject({ status: 409, message: "Já existe um registo igual" });
    });
});

describe("errorHandler: os details de um 5xx continuam a ser internos", () => {
    // O /health/db manda o erro cru do driver, que pode trazer host e utilizador.
    const erroDoDriver = new HttpError(503, "Falha na ligação à base de dados", undefined, {
        message: "password authentication failed for user postgres",
        host: "db.interno.local",
    });

    it("esconde os details de um 503 em produção", () => {
        process.env.NODE_ENV = "production";

        const gravado = lancar(erroDoDriver);

        expect(gravado.status).toBe(503);
        expect(gravado.body?.data).toBeUndefined();
        expect(JSON.stringify(gravado.body)).not.toContain("db.interno.local");
        expect(JSON.stringify(gravado.body)).not.toContain("password authentication failed");
    });

    it("mostra os details de um 503 em dev, que é para isso que lá estão", () => {
        process.env.NODE_ENV = "development";

        const gravado = lancar(erroDoDriver);

        expect(gravado.status).toBe(503);
        expect(JSON.stringify(gravado.body)).toContain("db.interno.local");
    });
});
