import type { Request, Response } from "express";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateProjectRequest,
    ListProjectsQuery,
    PatchProjectRequest,
    ProjectResponse,
} from "../dtos/project/project-dto.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getInvolvedUserIdsByProjectId } from "../repositories/allocation-repo.js";
import { getCompanyById } from "../repositories/company-repo.js";
import {
    createProject as saveProject,
    getProjectByCompanyIdAndName,
    getProjectById,
    getProjectsByCompanyId,
    getProjectsByCompanyIdAndStatus,
    projectRepo,
    updateProject,
} from "../repositories/project-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { notifyBudgetCrossings } from "../services/budget-alerts.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import { notifier } from "../services/notifier.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Projeto não encontrado";
const OUTSIDE_COMPANY = "Só pode criar projetos na sua empresa";

const toResponse = (project: Project): ProjectResponse => ({
    id: project.id,
    companyId: project.companyId,
    managerId: project.managerId,
    name: project.name,
    clientName: project.clientName,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    budget: project.budget,
});

/**
 * O novo gestor sabe que passou a gerir; quem está no projeto sabe que o
 * estado mudou. Quem fez a alteração não recebe nada.
 */
async function notifyProjectChanges(
    actor: User,
    saved: Project,
    previous: Pick<Project, "managerId" | "status">,
): Promise<void> {
    const ref = { projectId: saved.id, projectName: saved.name };

    if (saved.managerId !== previous.managerId) {
        await notifier.notify("project.manager_assigned", {
            companyId: saved.companyId,
            recipientIds: [saved.managerId],
            exclude: [actor.id],
            data: ref,
        });
    }

    if (saved.status !== previous.status) {
        const involved = await getInvolvedUserIdsByProjectId(saved.id);

        await notifier.notify("project.status_changed", {
            companyId: saved.companyId,
            recipientIds: [...involved, saved.managerId],
            exclude: [actor.id],
            data: { ...ref, from: previous.status, to: saved.status },
        });
    }
}

export const createProject = async (req: Request, res: Response) => {
    const body = req.body as CreateProjectRequest;
    const actor: User = getCurrentActor(req);

    const companyId = resolveCompanyScope(actor, body.companyId, OUTSIDE_COMPANY);

    const company = await getCompanyById(companyId);

    if (!company) {
        throw new HttpError(404, "Empresa não encontrada");
    }

    if (body.managerId) {
        const manager = await getUserById(body.managerId);

        if (!manager || manager.companyId !== companyId) {
            throw new HttpError(404, "Gestor não encontrado nesta empresa");
        }
    }

    if (await getProjectByCompanyIdAndName(companyId, body.name)) {
        throw new HttpError(409, "Já existe um projeto com este nome nesta empresa");
    }

    const created: Project = await saveProject(
        projectRepo.create({
            companyId,
            name: body.name,
            managerId: body.managerId ?? null,
            clientName: body.clientName ?? null,
            ...(body.status ? { status: body.status } : {}),
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
            budget: body.budget ?? null,
        }),
    );

    await notifier.notify("project.manager_assigned", {
        companyId: created.companyId,
        recipientIds: [created.managerId],
        exclude: [actor.id],
        data: { projectId: created.id, projectName: created.name },
    });

    return new HttpResponse(201, "Projeto criado", undefined, toResponse(created)).send(res);
}

export const listProjects = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListProjectsQuery;

    const companyId = resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa");

    const projects = query.status
        ? await getProjectsByCompanyIdAndStatus(companyId, query.status)
        : await getProjectsByCompanyId(companyId);

    return new HttpResponse(200, "Projetos", undefined, projects.map(toResponse)).send(res);
}

export const getProject = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const project = requireInReach(actor, await getProjectById(id), NOT_FOUND);

    return new HttpResponse(200, "Projeto", undefined, toResponse(project)).send(res);
}

export const patchProject = async (req: Request, res: Response) => {
    const body = req.body as PatchProjectRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const project = requireInReach(actor, await getProjectById(id), NOT_FOUND);

    // O save devolve o mesmo objeto, por isso o "antes" guarda-se já.
    const previous = { managerId: project.managerId, status: project.status };
    const previousBudget = project.budget;

    const startDate = body.startDate === undefined ? project.startDate : body.startDate;
    const endDate = body.endDate === undefined ? project.endDate : body.endDate;

    // O Zod só vê o patch, por isso as datas comparam-se aqui com as que estão gravadas.
    if (startDate && endDate && endDate < startDate) {
        throw invalidData([{ field: "endDate", message: "A data de fim não pode ser anterior à data de início" }]);
    }

    if (body.managerId) {
        const manager = await getUserById(body.managerId);

        if (!manager || manager.companyId !== project.companyId) {
            throw new HttpError(404, "Gestor não encontrado nesta empresa");
        }
    }

    if (body.name !== undefined && body.name !== project.name) {
        const sameName = await getProjectByCompanyIdAndName(project.companyId, body.name);

        if (sameName && sameName.id !== project.id) {
            throw new HttpError(409, "Já existe um projeto com este nome nesta empresa");
        }

        project.name = body.name;
    }

    if (body.managerId !== undefined) {
        project.managerId = body.managerId;
    }

    if (body.clientName !== undefined) {
        project.clientName = body.clientName;
    }

    if (body.status !== undefined) {
        project.status = body.status;
    }

    if (body.budget !== undefined) {
        project.budget = body.budget;
    }

    project.startDate = startDate;
    project.endDate = endDate;

    const saved = await updateProject(project);

    await notifyProjectChanges(actor, saved, previous);

    // Baixar o orçamento pode pôr o que já se gastou acima dos 80% ou dos 100%.
    if (saved.budget !== previousBudget) {
        await notifyBudgetCrossings(actor, saved, { previousBudget });
    }

    return new HttpResponse(200, "Projeto atualizado", undefined, toResponse(saved)).send(res);
}
