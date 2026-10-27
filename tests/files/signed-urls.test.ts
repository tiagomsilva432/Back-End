import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { checkSignature, expiryFor, signedFileUrl } from "../../src/services/files/signed-urls.js";

const HORA = 60 * 60 * 1000;

const partes = (url: string) => {
    const { pathname, searchParams } = new URL(url);

    return { id: pathname.split("/").pop()!, exp: searchParams.get("exp")!, sig: searchParams.get("sig")! };
};

describe("links assinados", () => {
    it("um link acabado de dar é válido, e aponta para a API", () => {
        const id = randomUUID();
        const url = signedFileUrl(id);
        const { exp, sig } = partes(url);

        expect(url.startsWith(`http://localhost:3000/files/${id}?`)).toBe(true);
        expect(checkSignature(id, exp, sig)).toBe("valid");
    });

    it("não serve para outro ficheiro, nem com a expiração mexida", () => {
        const id = randomUUID();
        const { exp, sig } = partes(signedFileUrl(id));

        expect(checkSignature(randomUUID(), exp, sig)).toBe("invalid");
        expect(checkSignature(id, String(Number(exp) + 3600), sig)).toBe("invalid");
        // O último carácter só tem 16 valores possíveis: trocar por "A" falhava quando já era "A".
        expect(checkSignature(id, exp, `${sig.slice(0, -1)}${sig.endsWith("A") ? "E" : "A"}`)).toBe("invalid");
        expect(checkSignature(id, exp, undefined)).toBe("invalid");
        expect(checkSignature(id, "amanhã", sig)).toBe("invalid");
    });

    it("expira entre uma e duas horas depois", () => {
        const agora = Date.UTC(2026, 9, 27, 10, 20);
        const id = randomUUID();
        const { exp, sig } = partes(signedFileUrl(id, agora));
        const validade = Number(exp) * 1000 - agora;

        expect(validade).toBeGreaterThanOrEqual(HORA);
        expect(validade).toBeLessThanOrEqual(2 * HORA);
        expect(checkSignature(id, exp, sig, agora + validade - 1)).toBe("valid");
        expect(checkSignature(id, exp, sig, agora + validade)).toBe("expired");
    });

    it("é o mesmo link durante a hora, para o browser o ter em cache", () => {
        const id = randomUUID();
        const inicio = Date.UTC(2026, 9, 27, 10, 0, 5);

        expect(signedFileUrl(id, inicio)).toBe(signedFileUrl(id, inicio + 50 * 60 * 1000));
        expect(expiryFor(inicio)).not.toBe(expiryFor(inicio + HORA));
    });
});
