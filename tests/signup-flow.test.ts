import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { Skill } from "../src/entities/Skill.js";
import { User } from "../src/entities/User.js";
import { criarEmpresa } from "./helpers/factories.js";
import { repo } from "./setup/db.js";

describe("registo completo: criar -> ativar -> entrar", () => {
    it("leva uma conta de convidada a autenticada", async () => {
        const empresa = await criarEmpresa();
        const email = "mariana@empresa.pt";
        const password = "Password1!";

        const criacao = await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email, role: "employee" })
            .expect(201);

        const signupToken: string = criacao.body.data.signupToken;
        expect(signupToken).toEqual(expect.any(String));

        await request(app).post("/auth/login").send({ email, password }).expect(401);

        await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password })
            .expect(200);

        const login = await request(app)
            .post("/auth/login")
            .send({ email, password })
            .expect(200);

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.user).toMatchObject({ email, role: "employee" });

        expect(await repo(User).findOneBy({ email })).toMatchObject({
            status: "active",
            mustChangePassword: false,
            signupToken: null,
        });
    });
});

describe("a montagem dos testes", () => {
    it("não vê nada do que os testes anteriores gravaram", async () => {
        expect(await repo(User).count()).toBe(0);
    });

    it("correu o seed", async () => {
        expect(await repo(Skill).count()).toBe(20);
    });
});
