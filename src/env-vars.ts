import type { SignOptions } from "jsonwebtoken";

const numberEnv = (name: string, fallback: number): number => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

//Ambiente
export const envIsDev: boolean = process.env.NODE_ENV !== "production";
//URLS
export const BASE_URL: string = process.env.BASE_URL ?? "http://localhost";
export const PORT: number = numberEnv("PORT", 3000);
//CORS
export const corsOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean);
//Auth
export const signupTokenExpDate = (): number => {
    return (numberEnv("SIGNUP_TOKEN_EXPIRATION_DAYS", 7) * 24) * 60 * 60 * 1000;
};
export const saltRounds = numberEnv("BCRYPT_ROUNDS", 12);
//JWT
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