import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { UpsertEmployeeProfileRequest } from "../dtos/user/employee-profile-dto.js";
import type { ListUsersQuery } from "../dtos/user/user-dto.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    employeeProfileRepo,
    getEmployeeProfileByUserId,
    updateEmployeeProfile,
} from "../repositories/employee-profile-repo.js";
import { getUserById, getUserByIdWithProfile, getUsersByCompanyId } from "../repositories/user-repo.js";
import { resolveCompanyScope } from "../services/company-scope.js";
import { toProfileResponse, toUserResponse } from "../services/user-mapper.js";
import { requireCanManageUser, requireUserInReach } from "../services/user-scope.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Utilizador não encontrado";
const PROFILE_NOT_FOUND = "Perfil não encontrado";
const CANNOT_MANAGE = "Só pode alterar o seu próprio perfil";

export const listUsers = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListUsersQuery;

    const companyId = resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa");

    const users = await getUsersByCompanyId(companyId, {
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
    });

    return new HttpResponse(200, "Utilizadores", undefined, users.map(toUserResponse)).send(res);
}

export const getUser = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const user = requireUserInReach(actor, await getUserByIdWithProfile(id), NOT_FOUND);

    return new HttpResponse(200, "Utilizador", undefined, toUserResponse(user)).send(res);
}

export const getUserProfile = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    // Ler é mais largo do que escrever: qualquer conta ativa da empresa.
    requireUserInReach(actor, await getUserById(id), NOT_FOUND);

    const profile = await getEmployeeProfileByUserId(id);

    if (!profile) {
        throw new HttpError(404, PROFILE_NOT_FOUND);
    }

    return new HttpResponse(200, "Perfil", undefined, toProfileResponse(profile)).send(res);
}

export const upsertUserProfile = async (req: Request, res: Response) => {
    const body = req.body as UpsertEmployeeProfileRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const target = requireUserInReach(actor, await getUserById(id), NOT_FOUND);

    requireCanManageUser(actor, target, CANNOT_MANAGE);

    const existing = await getEmployeeProfileByUserId(id);

    // O userId é a chave primária, logo o save() já é um upsert.
    const saved = await updateEmployeeProfile(
        employeeProfileRepo.create({
            userId: id,
            firstName: body.firstName,
            lastName: body.lastName,
            hireDate: body.hireDate,
            phone: body.phone ?? null,
            address: body.address ?? null,
            birthDate: body.birthDate ?? null,
            jobTitle: body.jobTitle ?? null,
            avatarUrl: body.avatarUrl ?? null,
        }),
    );

    return new HttpResponse(
        existing ? 200 : 201,
        existing ? "Perfil atualizado" : "Perfil criado",
        undefined,
        toProfileResponse(saved),
    ).send(res);
}
