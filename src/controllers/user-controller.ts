import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { UpsertEmployeeProfileRequest } from "../dtos/user/employee-profile-dto.js";
import type { ListUsersQuery, PatchUserStatusRequest } from "../dtos/user/user-dto.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    employeeProfileRepo,
    getEmployeeProfileByUserId,
    updateEmployeeProfile,
} from "../repositories/employee-profile-repo.js";
import {
    changeUserStatus,
    getUserById,
    getUserByIdWithProfile,
    getUsersByCompanyId,
} from "../repositories/user-repo.js";
import { canAdministerAccount } from "../services/account-policy.js";
import { resolveCompanyScope } from "../services/company-scope.js";
import { realtime } from "../services/realtime.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { fileHandlers } from "../services/files/file-handlers.js";
import { avatarUrlsOf, toProfileResponse, toUserResponse } from "../services/user-mapper.js";
import { requireCanManageUser, requireUserInReach } from "../services/user-scope.js";
import { FileKind, UserStatus } from "../types/enums.js";
import { isoDate } from "../utils/dates.js";
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

    const avatars = await avatarUrlsOf(users.map((user) => user.id));

    return new HttpResponse(200, "Utilizadores", undefined, users.map((user) => toUserResponse(user, avatars))).send(res);
}

export const getUser = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const user = requireUserInReach(actor, await getUserByIdWithProfile(id), NOT_FOUND);

    return new HttpResponse(200, "Utilizador", undefined, toUserResponse(user, await avatarUrlsOf([user.id]))).send(res);
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

    const avatars = await avatarUrlsOf([id]);

    return new HttpResponse(200, "Perfil", undefined, toProfileResponse(profile, avatars.get(id) ?? null)).send(res);
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
        }),
    );

    return new HttpResponse(
        existing ? 200 : 201,
        existing ? "Perfil atualizado" : "Perfil criado",
        undefined,
        // O avatar não vem no PUT: tem rota própria, e um PUT sem ele não o apaga.
        toProfileResponse(saved, (await avatarUrlsOf([id])).get(id) ?? null),
    ).send(res);
}

/** As regras do PUT do perfil: a própria pessoa, ou quem administra a conta dela. */
const avatar = fileHandlers(FILE_KINDS[FileKind.Avatar], {
    requireOwner: async (actor, req) => {
        const id = uuidParam(req.params.id, NOT_FOUND);
        const target = requireUserInReach(actor, await getUserById(id), NOT_FOUND);

        requireCanManageUser(actor, target, CANNOT_MANAGE);

        return { companyId: target.companyId, ownerId: target.id, owner: target };
    },
    messages: { uploaded: "Avatar atualizado", removed: "Avatar apagado", notFound: "Este utilizador não tem avatar" },
});

/** Substitui o que houver: um avatar por pessoa. */
export const uploadAvatar = avatar.upload;
export const removeAvatar = avatar.remove;

/**
 * As transições permitidas. Uma conta convidada só sai para terminada: o link de
 * ativação não olha para o estado, por isso suspendê-la não a travava.
 */
const ALLOWED_TRANSITIONS: Record<UserStatus, readonly UserStatus[]> = {
    [UserStatus.Invited]: [UserStatus.Terminated],
    [UserStatus.Active]: [UserStatus.Suspended, UserStatus.Terminated],
    [UserStatus.Suspended]: [UserStatus.Active, UserStatus.Terminated],
    [UserStatus.Terminated]: [],
};

/** Os estados como aparecem nas mensagens de erro. */
const STATUS_LABELS: Record<UserStatus, string> = {
    [UserStatus.Invited]: "convidada",
    [UserStatus.Active]: "ativa",
    [UserStatus.Suspended]: "suspensa",
    [UserStatus.Terminated]: "terminada",
};

export const patchUserStatus = async (req: Request, res: Response) => {
    const { status } = req.body as PatchUserStatusRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const target = requireUserInReach(actor, await getUserByIdWithProfile(id), NOT_FOUND);

    // Suspender-se a si próprio deixava a empresa sem quem a reativasse.
    if (target.id === actor.id) {
        throw new HttpError(403, "Não pode alterar o estado da sua própria conta");
    }

    if (!canAdministerAccount(actor.role, target.role)) {
        throw new HttpError(403, "Sem permissões para alterar o estado desta conta");
    }

    if (target.status !== status) {
        if (!ALLOWED_TRANSITIONS[target.status].includes(status)) {
            throw new HttpError(409, `Uma conta ${STATUS_LABELS[target.status]} não pode passar a ${STATUS_LABELS[status]}`);
        }

        if (!(await changeUserStatus(target.id, target.status, status, isoDate()))) {
            throw new HttpError(409, "O estado desta conta mudou entretanto. Atualize e tente outra vez");
        }

        target.status = status;

        // O stream em direto não espera que o token expire.
        if (status !== UserStatus.Active) {
            realtime.disconnectUser(target.id, "account_inactive");
        }
    }

    return new HttpResponse(
        200,
        "Estado da conta atualizado",
        undefined,
        toUserResponse(target, await avatarUrlsOf([target.id])),
    ).send(res);
}
