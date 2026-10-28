import { type FindOptionsWhere, In } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity.js";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import { type UserRole, UserStatus } from "../types/enums.js";
import { isUuid } from "../utils/params.js";
import { endAllocationsOn } from "./allocation-repo.js";
import { endSalariesOn } from "./salary-repo.js";

export const userRepo = AppDataSource.getRepository(User);

export async function getUserByEmailAndCompanyId(email: string, companyId: string): Promise< User | null > {
    return await userRepo.findOneBy({
        email,
        companyId
    });
}

export async function getUserById(id: string): Promise <User | null> {
    return await userRepo.findOneBy({
        id
    });
}

/** Todas as contas com este email: só é único dentro da empresa. */
export async function getUsersByEmail(email: string): Promise <User[]> {
    return await userRepo.find({
        where: { email },
        order: { companyId: "ASC" }
    });
}

// Um link cortado traz um token que não é uuid: na coluna uuid isso era um 500, e é só um token inválido.
export async function getUserBySignupToken(signupToken:string): Promise <User | null> {
    if (!isUuid(signupToken)) {
        return null;
    }

    return await userRepo.findOneBy({
        signupToken
    });
}

/** Com o perfil: um utilizador sem nome não serve para ser mostrado. */
export async function getUserByIdWithProfile(id: string): Promise <User | null> {
    return await userRepo.findOne({
        where: { id },
        relations: { profile: true }
    });
}

export async function getUserByPasswordResetToken(passwordResetToken: string): Promise <User | null> {
    if (!isUuid(passwordResetToken)) {
        return null;
    }

    return await userRepo.findOneBy({
        passwordResetToken
    });
}

/** O diretório da empresa, com o perfil de cada um, numa query. */
export async function getUsersByCompanyId(
    companyId: string,
    filters: { role?: UserRole; status?: UserStatus } = {}
): Promise <User[]> {
    return await userRepo.find({
        where: {
            companyId,
            ...(filters.role ? { role: filters.role } : {}),
            ...(filters.status ? { status: filters.status } : {})
        },
        relations: { profile: true },
        order: { email: "ASC" }
    });
}

/** De todas as empresas: um system_admin vive numa e age em todas. */
export async function getUsersByRole(
    role: UserRole,
    filters: { status?: UserStatus } = {}
): Promise <User[]> {
    return await userRepo.find({
        where: {
            role,
            ...(filters.status ? { status: filters.status } : {})
        },
        order: { email: "ASC" }
    });
}

export async function getUsersByIds(ids: string[]): Promise <User[]> {
    if (ids.length === 0) {
        return [];
    }

    return await userRepo.findBy({
        id: In(ids)
    });
}

/**
 * Só as colunas indicadas, e só se a linha ainda cumprir o `where`. Um save()
 * reescrevia as colunas que outro pedido mudou entretanto: um login a meio do
 * bcrypt repunha "active" numa conta acabada de suspender.
 */
export async function updateUserFields(
    id: string,
    fields: QueryDeepPartialEntity<User>,
    where: FindOptionsWhere<User> = {},
): Promise<boolean> {
    const result = await userRepo.update({ ...where, id }, fields);
    return (result.affected ?? 0) > 0;
}

/**
 * Só muda se a conta ainda estiver em `from`. Terminar revoga os tokens e fecha,
 * na mesma transação, o salário e as alocações no `lastDay`: senão a pessoa
 * continuava a custar nas finanças até hoje.
 */
export async function changeUserStatus(id: string, from: UserStatus, to: UserStatus, lastDay: string): Promise<boolean> {
    return await userRepo.manager.transaction(async (manager) => {
        const terminating = to === UserStatus.Terminated;
        const result = await manager.getRepository(User).update({ id, status: from }, {
            status: to,
            ...(terminating
                ? { signupToken: null, signupTokenExpiresAt: null, passwordResetToken: null, passwordResetExpiresAt: null }
                : {}),
        });

        if ((result.affected ?? 0) === 0) {
            return false;
        }

        if (terminating) {
            await endSalariesOn(manager, id, lastDay);
            await endAllocationsOn(manager, id, lastDay);
        }

        return true;
    });
}

export async function createUser(user: User){
    return await userRepo.save(user);
}
