import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import type { User } from "../entities/User.js";
import { getUserById } from "../repositories/user-repo.js";
import { UserRole, UserStatus } from "../types/enums.js";
import { getAuth } from "./requireAuth.js";

export function requireRole(...roles: UserRole[]) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        const claims = getAuth(req);

        const user: User | null = await getUserById(claims.sub);

        if (!user) {
            return next(new HttpError(401, "Sessão inválida. Inicie sessão novamente"));
        }

        if (user.status !== UserStatus.Active || user.mustChangePassword) {
            return next(new HttpError(403, "Conta não está ativa"));
        }

        if (roles.length > 0 && !roles.includes(user.role)) {
            return next(new HttpError(403, "Sem permissões para esta operação"));
        }

        req.currentUser = user;
        next();
    };
}

/** As rotas de gestão. O controller prende o company_admin à sua empresa. */
export const requireAdmin = requireRole(UserRole.SystemAdmin, UserRole.CompanyAdmin);

export function getCurrentActor(req: Request): User {
    if (!req.currentUser) {
        throw new HttpError(401);
    }
    return req.currentUser;
}
