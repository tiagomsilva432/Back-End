import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import type { UserRole, UserStatus } from "../types/enums.js";

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

export async function getUserBySignupToken(signupToken:string): Promise <User | null> {
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

export async function updateUser(user: User){
    return await userRepo.save(user);
}

export async function createUser(user: User){
    return await userRepo.save(user);
}
