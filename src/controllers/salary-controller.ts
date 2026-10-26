import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { CreateSalaryRequest, SalaryResponse } from "../dtos/salary/salary-dto.js";
import type { Salary } from "../entities/Salary.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    getSalaryHistoryByUserId,
    getSalaryInForce,
    removeLatestSalary,
    replaceOpenSalary,
    salaryRepo,
} from "../repositories/salary-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { canAdministerAccount } from "../services/account-policy.js";
import { requireUserInReach } from "../services/user-scope.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";

const USER_NOT_FOUND = "Utilizador não encontrado";
const NOT_FOUND = "Salário não encontrado";

const toResponse = (salary: Salary): SalaryResponse => ({
    id: salary.id,
    userId: salary.userId,
    amount: salary.amount,
    currency: salary.currency,
    effectiveFrom: salary.effectiveFrom,
    effectiveTo: salary.effectiveTo,
    reason: salary.reason,
    createdBy: salary.createdBy,
    createdAt: salary.createdAt.toISOString(),
});

/** Ler um salário: a própria pessoa, ou quem administra a conta dela. Os colegas não. */
const requireSalaryReader = async (actor: User, userId: string): Promise<User> => {
    const target = requireUserInReach(actor, await getUserById(userId), USER_NOT_FOUND);

    if (target.id !== actor.id && !canAdministerAccount(actor.role, target.role)) {
        throw new HttpError(403, "Sem permissões para ver o salário desta pessoa");
    }

    return target;
};

/** Escrever um salário: quem administra a conta, e nunca sobre si próprio. */
const requireSalaryWriter = async (actor: User, userId: string): Promise<User> => {
    const target = requireUserInReach(actor, await getUserById(userId), USER_NOT_FOUND);

    if (target.id === actor.id || !canAdministerAccount(actor.role, target.role)) {
        throw new HttpError(403, "Sem permissões para alterar o salário desta pessoa");
    }

    return target;
};

export const listUserSalaries = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    await requireSalaryReader(actor, id);

    const salaries = await getSalaryHistoryByUserId(id);

    return new HttpResponse(200, "Salários", undefined, salaries.map(toResponse)).send(res);
}

export const getUserCurrentSalary = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    await requireSalaryReader(actor, id);

    // Em vigor hoje, e não o mais recente: esse pode ser um aumento ainda por começar.
    const salary = await getSalaryInForce(id, isoDate());

    if (!salary) {
        throw new HttpError(404, "Esta pessoa não tem salário em vigor");
    }

    return new HttpResponse(200, "Salário em vigor", undefined, toResponse(salary)).send(res);
}

export const createUserSalary = async (req: Request, res: Response) => {
    const body = req.body as CreateSalaryRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    await requireSalaryWriter(actor, id);

    const [latest] = await getSalaryHistoryByUserId(id);

    // O CHECK pede effectiveTo > effectiveFrom, e o histórico não se reescreve:
    // um salário novo começa sempre depois do último.
    if (latest && body.effectiveFrom <= latest.effectiveFrom) {
        throw new HttpError(
            409,
            `O novo salário tem de começar depois de ${latest.effectiveFrom}, quando começa o mais recente`,
        );
    }

    const open = latest && latest.effectiveTo === null ? latest : null;

    if (open) {
        open.effectiveTo = body.effectiveFrom;
    }

    const created = await replaceOpenSalary(
        open,
        salaryRepo.create({
            userId: id,
            amount: body.amount,
            currency: body.currency,
            effectiveFrom: body.effectiveFrom,
            effectiveTo: null,
            reason: body.reason ?? null,
            createdBy: actor.id,
        }),
    );

    return new HttpResponse(201, "Salário definido", undefined, toResponse(created)).send(res);
}

/**
 * Para corrigir um erro de registo, e só no mais recente: apagar a meio do
 * histórico deixava um buraco entre dois salários.
 */
export const removeUserSalary = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);
    const salaryId = uuidParam(req.params.salaryId, NOT_FOUND);

    await requireSalaryWriter(actor, id);

    const [latest, previous] = await getSalaryHistoryByUserId(id);

    if (!latest) {
        throw new HttpError(404, NOT_FOUND);
    }

    if (latest.id !== salaryId) {
        const exists = await salaryRepo.existsBy({ id: salaryId, userId: id });
        if (!exists) {
            throw new HttpError(404, NOT_FOUND);
        }
        throw new HttpError(409, "Só o salário mais recente pode ser apagado");
    }

    // Só se reabre o anterior se foi este que o fechou.
    const reopen = previous && previous.effectiveTo === latest.effectiveFrom ? previous : null;

    if (reopen) {
        reopen.effectiveTo = null;
    }

    await removeLatestSalary(latest, reopen);

    return new HttpResponse(200, "Salário apagado").send(res);
}
