import { afterEach, describe, expect, it } from "@jest/globals";
import { buildEnvelope } from "../src/services/mailer.js";

const empresa = { name: "ACME", email: "geral@acme.pt" };

afterEach(() => {
    process.env.MAIL_ALLOW_COMPANY_FROM = "false";
    process.env.MAIL_FROM = "nao-responder@localhost";
});

describe("buildEnvelope", () => {
    it("por omissão envia do MAIL_FROM e devolve a resposta à empresa", () => {
        process.env.MAIL_FROM = "demo@gmail.com";

        expect(buildEnvelope(empresa)).toEqual({
            from: { name: "ACME", address: "demo@gmail.com" },
            replyTo: "geral@acme.pt",
        });
    });

    it("usa o email da empresa como remetente quando isso é permitido", () => {
        process.env.MAIL_ALLOW_COMPANY_FROM = "true";

        expect(buildEnvelope(empresa)).toEqual({
            from: { name: "ACME", address: "geral@acme.pt" },
            replyTo: "geral@acme.pt",
        });
    });

    it("recorre ao MAIL_FROM quando a empresa não tem email", () => {
        process.env.MAIL_ALLOW_COMPANY_FROM = "true";
        process.env.MAIL_FROM = "demo@gmail.com";

        expect(buildEnvelope({ name: "ACME", email: null })).toEqual({
            from: { name: "ACME", address: "demo@gmail.com" },
            replyTo: undefined,
        });
    });
});
