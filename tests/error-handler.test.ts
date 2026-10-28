import { afterEach, describe, expect, it } from "@jest/globals";
import type { Response } from "express";
import request from "supertest";
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
