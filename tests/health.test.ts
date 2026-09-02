import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /health", () => {
    it("responde 200 sem tocar na base de dados", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            status: 200,
            message: "Ligação com a API OK",
            code: "SUCCESS_OK",
            data: undefined,
        });
    });
});

describe("GET /health/db", () => {
    it("responde 200 com a base de dados mesmo ligada", async () => {
        const res = await request(app).get("/health/db");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 200,
            message: "Ligação com a Base de Dados OK",
        });
    });
});

describe("rota inexistente", () => {
    it("responde 404", async () => {
        const res = await request(app).get("/nao-existe");

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ status: 404 });
    });
});
