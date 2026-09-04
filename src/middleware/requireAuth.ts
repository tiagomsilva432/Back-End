import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { HttpError } from "../dtos/common/errors-dto.js";
import { jwtSecret } from "../env-vars.js";
import { jwtPayloadSchema, type JwtPayload } from "../dtos/auth/jwt-dto.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
    const BEARER = /^bearer\s+(\S+)$/i;

    const token = BEARER.exec(req.headers.authorization?.trim() ?? "")?.[1];

    if (!token) {
        return next(new HttpError(401, "Token em falta"));
    }

    jwt.verify(token, jwtSecret(), (error, payload) => {
        if (error) {
            return next(new HttpError(401, "Token inválido"));
        }
        const claims = jwtPayloadSchema.safeParse(payload);
        if (!claims.success) {
            return next(new HttpError(401, "Token inválido"));
        }

        req.auth = claims.data;
        next();
    });
}

export function getAuth(req: Request): JwtPayload {
    if (!req.auth) {
        throw new HttpError(401);
    }
    return req.auth;
}
