import type { Request, Response } from "express";
import type {
    AllocationLoadResponse,
    CreateAllocationRequest,
    ListAllocationsQuery,
    PatchAllocationRequest,
} from "../dtos/allocation/allocation-dto.js";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { Allocation } from "../entities/Allocation.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    allocationRepo,
    createAllocation as saveAllocation,
    deleteAllocation,
    getActiveAllocationsByUserId,
    getAllocationById,
    getAllocationsByProjectId,
    getAllocationsByUserId,
    getOpenAllocation,
    getOpenAllocationsByProjectId,
    getOpenAllocationsByUserId,
    updateAllocation,
} from "../repositories/allocation-repo.js";
import { getProjectById } from "../repositories/project-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { toAllocationResponse } from "../services/allocation-mapper.js";
import { requireInReach } from "../services/company-scope.js";
import { notifier } from "../services/notifier.js";
import { requireUserInReach } from "../services/user-scope.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Alocação não encontrada";
const PROJECT_NOT_FOUND = "Projeto não encontrado";
const USER_NOT_FOUND = "Utilizador não encontrado";
const ALREADY_OPEN = "Este utilizador já tem uma alocação aberta neste projeto";

/** A alocação não tem companyId: o alcance vem do projeto. */
const projectOfAllocation = async (actor: User, projectId: string) =>
    requireInReach(actor, await getProjectById(projectId), NOT_FOUND);

type AllocationSnapshot = Pick<Allocation, "allocationPercent" | "roleOnProject" | "endDate">;

/** Uma notificação por pedido: fechar a alocação ganha a tudo o que mudou junto. */
async function notifyAllocationChange(
    actor: User,
    project: Project,
    saved: Allocation,
    before: AllocationSnapshot,
): Promise<void> {
    const changes = (["allocationPercent", "roleOnProject", "endDate"] as const)
        .filter((field) => saved[field] !== before[field]);

    if (changes.length === 0) {
        return;
    }

    const target = { companyId: project.companyId, recipientIds: [saved.userId], exclude: [actor.id] };
    const ref = { allocationId: saved.id, projectId: project.id, projectName: project.name };

    if (before.endDate === null && saved.endDate !== null) {
        await notifier.notify("allocation.ended", { ...target, data: { ...ref, endDate: saved.endDate } });
        return;
    }

    await notifier.notify("allocation.updated", {
        ...target,
        data: {
            ...ref,
            allocationPercent: saved.allocationPercent,
            roleOnProject: saved.roleOnProject,
            endDate: saved.endDate,
            changes,
        },
    });
}

export const createAllocation = async (req: Request, res: Response) => {
    const body = req.body as CreateAllocationRequest;
    const actor: User = getCurrentActor(req);

    const project = requireInReach(actor, await getProjectById(body.projectId), PROJECT_NOT_FOUND);
    const user = requireUserInReach(actor, await getUserById(body.userId), USER_NOT_FOUND);

    // Mesma resposta de um utilizador desconhecido: nunca se confirma que
    // existe alguém noutra empresa.
    if (user.companyId !== project.companyId) {
        throw new HttpError(404, USER_NOT_FOUND);
    }

    // Só para alocações abertas: o índice único não cobre as que já fecharam,
    // por isso registar uma alocação antiga é legítimo.
    if (!body.endDate && (await getOpenAllocation(body.userId, body.projectId))) {
        throw new HttpError(409, ALREADY_OPEN);
    }

    const created = await saveAllocation(
        allocationRepo.create({
            userId: body.userId,
            projectId: body.projectId,
            allocationPercent: body.allocationPercent,
            roleOnProject: body.roleOnProject ?? null,
            startDate: body.startDate,
            endDate: body.endDate ?? null,
        }),
    );

    // Registar uma alocação que já acabou é histórico, não novidade.
    if (!created.endDate || created.endDate >= isoDate()) {
        await notifier.notify("allocation.created", {
            companyId: project.companyId,
            recipientIds: [created.userId],
            exclude: [actor.id],
            data: {
                allocationId: created.id,
                projectId: project.id,
                projectName: project.name,
                allocationPercent: created.allocationPercent,
                roleOnProject: created.roleOnProject,
                startDate: created.startDate,
                endDate: created.endDate,
            },
        });
    }

    return new HttpResponse(201, "Alocação criada", undefined, toAllocationResponse(created)).send(res);
}

export const listProjectAllocations = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, PROJECT_NOT_FOUND);
    const query = req.validQuery as ListAllocationsQuery;

    requireInReach(actor, await getProjectById(id), PROJECT_NOT_FOUND);

    const allocations = query.open
        ? await getOpenAllocationsByProjectId(id)
        : await getAllocationsByProjectId(id);

    return new HttpResponse(200, "Alocações", undefined, allocations.map(toAllocationResponse)).send(res);
}

export const listUserAllocations = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);
    const query = req.validQuery as ListAllocationsQuery;

    requireUserInReach(actor, await getUserById(id), USER_NOT_FOUND);

    const allocations = query.open
        ? await getOpenAllocationsByUserId(id)
        : await getAllocationsByUserId(id);

    return new HttpResponse(200, "Alocações", undefined, allocations.map(toAllocationResponse)).send(res);
}

export const getUserAllocationLoad = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    requireUserInReach(actor, await getUserById(id), USER_NOT_FOUND);

    const allocations = await getActiveAllocationsByUserId(id);
    const totalPercent = allocations.reduce((total, a) => total + a.allocationPercent, 0);

    const data: AllocationLoadResponse = {
        userId: id,
        totalPercent,
        overAllocated: totalPercent > 100,
    };

    return new HttpResponse(200, "Carga de alocação", undefined, data).send(res);
}

export const patchAllocation = async (req: Request, res: Response) => {
    const body = req.body as PatchAllocationRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const allocation = await getAllocationById(id);

    if (!allocation) {
        throw new HttpError(404, NOT_FOUND);
    }

    const project = await projectOfAllocation(actor, allocation.projectId);

    const endDate = body.endDate === undefined ? allocation.endDate : body.endDate;

    // O Zod só vê o patch, por isso a data compara-se aqui com a que está gravada.
    if (endDate && endDate < allocation.startDate) {
        throw invalidData([{ field: "endDate", message: "A data de fim não pode ser anterior à data de início" }]);
    }

    // Reabrir volta a disputar o índice único. Só corre de fechada para aberta,
    // e nessa altura a linha encontrada é sempre outra, nunca esta.
    if (
        endDate === null
        && allocation.endDate !== null
        && (await getOpenAllocation(allocation.userId, allocation.projectId))
    ) {
        throw new HttpError(409, ALREADY_OPEN);
    }

    // O save devolve o mesmo objeto, por isso o "antes" guarda-se já.
    const before: AllocationSnapshot = {
        allocationPercent: allocation.allocationPercent,
        roleOnProject: allocation.roleOnProject,
        endDate: allocation.endDate,
    };

    allocation.endDate = endDate;

    if (body.allocationPercent !== undefined) {
        allocation.allocationPercent = body.allocationPercent;
    }

    if (body.roleOnProject !== undefined) {
        allocation.roleOnProject = body.roleOnProject;
    }

    const saved = await updateAllocation(allocation);

    await notifyAllocationChange(actor, project, saved, before);

    return new HttpResponse(200, "Alocação atualizada", undefined, toAllocationResponse(saved)).send(res);
}

/**
 * Apagar é para corrigir um erro, como um startDate errado. Terminar uma alocação
 * é fechá-la. Por isso apagar não notifica ninguém: fechar notifica.
 */
export const removeAllocation = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const allocation = await getAllocationById(id);

    if (!allocation) {
        throw new HttpError(404, NOT_FOUND);
    }

    await projectOfAllocation(actor, allocation.projectId);

    await deleteAllocation(id);

    return new HttpResponse(200, "Alocação apagada").send(res);
}
