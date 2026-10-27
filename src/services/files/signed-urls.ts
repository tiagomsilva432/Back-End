import { createHmac, timingSafeEqual } from "node:crypto";
import { apiPublicUrl, fileUrlTtlSeconds, jwtSecret } from "../../env-vars.js";

/**
 * Os links dos ficheiros. Um <img src> ou um <a href> não mandam o header
 * Authorization, por isso o link leva a autorização com ele: uma assinatura
 * que só a API sabe fazer, e que expira.
 *
 * A API só dá um link dentro de uma resposta que já passou a verificação do
 * recurso (a despesa, a ausência, o perfil). Quem tem o link pode ver o
 * ficheiro até ele expirar, e só isso.
 */

/** Uma chave só para isto, tirada do segredo do JWT: nenhuma variável nova para configurar. */
const signingKey = (): Buffer => createHmac("sha256", jwtSecret()).update("files:signed-urls").digest();

const sign = (fileId: string, expiresAt: number): string =>
    createHmac("sha256", signingKey()).update(`${fileId}.${expiresAt}`).digest("base64url");

/**
 * A expiração é o fim do próximo bloco de TTL, e não agora + TTL: assim o link
 * é o mesmo durante um bloco inteiro, e o browser usa a imagem da cache em vez
 * de a pedir a cada lista. Vale entre um e dois TTLs.
 */
export function expiryFor(now: number = Date.now()): number {
    const ttl = fileUrlTtlSeconds();
    const seconds = Math.floor(now / 1000);

    return (Math.floor(seconds / ttl) + 2) * ttl;
}

export function signedFileUrl(fileId: string, now: number = Date.now()): string {
    const expiresAt = expiryFor(now);

    return `${apiPublicUrl()}/files/${fileId}?exp=${expiresAt}&sig=${sign(fileId, expiresAt)}`;
}

export type SignatureCheck = "valid" | "invalid" | "expired";

export function checkSignature(fileId: string, exp: unknown, sig: unknown, now: number = Date.now()): SignatureCheck {
    if (typeof exp !== "string" || typeof sig !== "string" || !/^\d+$/.test(exp)) {
        return "invalid";
    }

    const expected = Buffer.from(sign(fileId, Number(exp)));
    const given = Buffer.from(sig);

    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return "invalid";
    }

    return Number(exp) * 1000 <= now ? "expired" : "valid";
}

/** Os segundos que faltam, para o Cache-Control nunca guardar mais do que o link vale. */
export const secondsLeft = (exp: string, now: number = Date.now()): number =>
    Math.max(0, Number(exp) - Math.floor(now / 1000));
