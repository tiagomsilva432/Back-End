import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { FileResponse } from "../dtos/file/file-dto.js";
import type {
    CreateProjectResourceRequest,
    PatchProjectResourceRequest,
    ProjectResourceResponse,
} from "../dtos/project/project-resource-dto.js";
import type { Project } from "../entities/Project.js";
import type { ProjectResource } from "../entities/ProjectResource.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getProjectById } from "../repositories/project-repo.js";
import {
    createProjectResource as saveResource,
    deleteProjectResource,
    getProjectResourceById,
    getProjectResourcesByProjectId,
    projectResourceRepo,
    updateProjectResource,
} from "../repositories/project-resource-repo.js";
import { requireInReach } from "../services/company-scope.js";
import { fileHandlers } from "../services/files/file-handlers.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { filesFor, removeFilesOf } from "../services/files/files.js";
import { canManageProject, requireProjectMember } from "../services/project-access.js";
import { FileKind } from "../types/enums.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Recurso não encontrado";
const PROJECT_NOT_FOUND = "Projeto não encontrado";

const toResponse = (resource: ProjectResource, file: FileResponse | null): ProjectResourceResponse => ({
    id: resource.id,
    projectId: resource.projectId,
    title: resource.title,
    url: resource.url,
    note: resource.note,
    file,
    createdBy: resource.createdBy,
    createdAt: resource.createdAt.toISOString(),
    updatedAt: resource.updatedAt.toISOString(),
});

const fileOf = async (resource: ProjectResource): Promise<FileResponse | null> =>
    (await filesFor(FileKind.ProjectResourceFile, [resource.id])).get(resource.id)?.[0] ?? null;

/** O projeto do :id: 404 se não se vê, 403 se se vê mas a pessoa não está nele. */
async function requireMemberProject(actor: User, req: Request): Promise<Project> {
    const project = requireInReach(actor, await getProjectById(uuidParam(req.params.id, PROJECT_NOT_FOUND)), PROJECT_NOT_FOUND);

    await requireProjectMember(actor, project, "Só quem está no projeto vê os recursos");

    return project;
}

/**
 * Um recurso deste projeto que a pessoa pode alterar: quem gere o projeto
 * altera todos, os outros só os que adicionaram. O de outro projeto é o mesmo
 * 404 de um que não existe.
 */
async function requireEditableResource(actor: User, req: Request): Promise<{ project: Project; resource: ProjectResource }> {
    const project = await requireMemberProject(actor, req);
    const resource = await getProjectResourceById(uuidParam(req.params.resourceId, NOT_FOUND));

    if (!resource || resource.projectId !== project.id) {
        throw new HttpError(404, NOT_FOUND);
    }

    if (!canManageProject(actor, project) && resource.createdBy !== actor.id) {
        throw new HttpError(403, "Só pode alterar os recursos que adicionou");
    }

    return { project, resource };
}

export const listProjectResources = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireMemberProject(actor, req);

    const resources = await getProjectResourcesByProjectId(project.id);
    const files = await filesFor(FileKind.ProjectResourceFile, resources.map((resource) => resource.id));

    return new HttpResponse(
        200,
        "Recursos do projeto",
        undefined,
        resources.map((resource) => toResponse(resource, files.get(resource.id)?.[0] ?? null)),
    ).send(res);
}

export const createProjectResource = async (req: Request, res: Response) => {
    const body = req.body as CreateProjectResourceRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireMemberProject(actor, req);

    const created = await saveResource(
        projectResourceRepo.create({
            projectId: project.id,
            title: body.title,
            url: body.url ?? null,
            note: body.note ?? null,
            createdBy: actor.id,
        }),
    );

    return new HttpResponse(201, "Recurso adicionado", undefined, toResponse(created, null)).send(res);
}

export const patchProjectResource = async (req: Request, res: Response) => {
    const body = req.body as PatchProjectResourceRequest;
    const actor: User = getCurrentActor(req);
    const { resource } = await requireEditableResource(actor, req);

    if (body.title !== undefined) {
        resource.title = body.title;
    }

    if (body.url !== undefined) {
        resource.url = body.url;
    }

    if (body.note !== undefined) {
        resource.note = body.note;
    }

    const saved = await updateProjectResource(resource);

    return new HttpResponse(200, "Recurso atualizado", undefined, toResponse(saved, await fileOf(saved))).send(res);
}

export const removeProjectResource = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const { resource } = await requireEditableResource(actor, req);

    await deleteProjectResource(resource.id);

    // Depois do recurso: um ficheiro que fique para trás apanha-o o files:sweep.
    await removeFilesOf(FileKind.ProjectResourceFile, resource.id);

    return new HttpResponse(200, "Recurso apagado").send(res);
}

/** Quem altera o recurso gere o ficheiro dele: as mesmas regras, os mesmos 404 e 403. */
const resourceFile = fileHandlers(FILE_KINDS[FileKind.ProjectResourceFile], {
    requireOwner: async (actor, req) => {
        const { project, resource } = await requireEditableResource(actor, req);

        return { companyId: project.companyId, ownerId: resource.id, owner: resource };
    },
    messages: { uploaded: "Ficheiro anexado", removed: "Ficheiro apagado", notFound: "Este recurso não tem ficheiro" },
});

/** Substitui o que houver: um ficheiro por recurso. */
export const uploadResourceFile = resourceFile.upload;
export const removeResourceFile = resourceFile.remove;
