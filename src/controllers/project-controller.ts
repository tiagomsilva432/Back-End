import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateProjectRequest,
    ListProjectsQuery,
    ProjectResponse,
} from "../dtos/project/project-dto.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getCompanyById } from "../repositories/company-repo.js";
import {
    createProject as saveProject,
    getProjectByCompanyIdAndName,
    getProjectById,
    getProjectsByCompanyId,
    getProjectsByCompanyIdAndStatus,
    projectRepo,
} from "../repositories/project-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { resolveCompanyScope } from "../services/company-scope.js";
import { UserRole } from "../types/enums.js";
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

    const project = await getProjectById(id);

    if (!project || (actor.role !== UserRole.SystemAdmin && project.companyId !== actor.companyId)) {
        throw new HttpError(404, NOT_FOUND);
    }

    return new HttpResponse(200, "Projeto", undefined, toResponse(project)).send(res);
}
