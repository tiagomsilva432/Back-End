import path from "node:path";
import type { SignOptions } from "jsonwebtoken";

const numberEnv = (name: string, fallback: number): number => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const envIsDev = (): boolean => process.env.NODE_ENV !== "production";

export const BASE_URL: string = process.env.BASE_URL ?? "http://localhost";
export const PORT: number = numberEnv("PORT", 3000);
/**
 * Onde o browser chega à API: o servidor que a documentação usa. Atrás do
 * Caddy é o PUBLIC_URL com /api, e não o BASE_URL:PORT de dentro do contentor.
 */
export const apiPublicUrl = (): string =>
    (process.env.API_PUBLIC_URL || `${BASE_URL}:${PORT}`).replace(/\/$/, "");
/** Base do frontend, para o link de ativação. Sem barra final. */
export const feUrl = (): string =>
    (process.env.FE_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const corsOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean);

export const signupTokenExpDate = (): number => {
    return (numberEnv("SIGNUP_TOKEN_EXPIRATION_DAYS", 7) * 24) * 60 * 60 * 1000;
};
/** Uma hora, e não os 7 dias do convite: um reset pede-se e usa-se logo. */
export const passwordResetExpDate = (): number => {
    return numberEnv("PASSWORD_RESET_EXPIRATION_HOURS", 1) * 60 * 60 * 1000;
};
export const saltRounds = numberEnv("BCRYPT_ROUNDS", 12);

export const jwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET não está definido");
    }
    return secret;
};

export const jwtExpiresIn = (): NonNullable<SignOptions["expiresIn"]> => {
    return (process.env.JWT_EXPIRES_IN ?? "1d") as NonNullable<SignOptions["expiresIn"]>;
};

/** A raiz dos uploads. Relativa ao diretório onde a API corre: /app/uploads no contentor. */
export const uploadsDir = (): string => path.resolve(process.env.UPLOADS_DIR || "uploads");
/**
 * Quanto tempo vale um link de um ficheiro, no mínimo: vale entre isto e o
 * dobro, porque a expiração é arredondada para o link não mudar a cada pedido.
 */
export const fileUrlTtlSeconds = (): number => numberEnv("FILE_URL_TTL_MINUTES", 60) * 60;

export const smtpHost = (): string | undefined => process.env.SMTP_HOST || undefined;
export const smtpPort = (): number => numberEnv("SMTP_PORT", 587);
export const smtpUser = (): string | undefined => process.env.SMTP_USER || undefined;
export const smtpPassword = (): string | undefined => process.env.SMTP_PASSWORD || undefined;

export const mailFrom = (): string => process.env.MAIL_FROM ?? "nao-responder@localhost";

/**
 * Só liga isto se o endereço de cada empresa estiver verificado no fornecedor
 * de SMTP. Caso contrário o From é reescrito ou a mensagem cai em spam, e a
 * empresa aparece só como nome e Reply-To.
 */
export const mailAllowCompanyFrom = (): boolean => process.env.MAIL_ALLOW_COMPANY_FROM === "true";