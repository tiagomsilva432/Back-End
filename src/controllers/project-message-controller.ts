import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    CreateProjectMessageRequest,
    ListProjectMessagesQuery,
    PatchProjectMessageRequest,
    ProjectMessagePageResponse,
    ProjectMessageResponse,
    UnreadProjectMessagesResponse,
} from "../dtos/project/project-message-dto.js";
import type { Project } from "../entities/Project.js";
import type { ProjectMessage } from "../entities/ProjectMessage.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getInvolvedProjectIdsByUserId } from "../repositories/allocation-repo.js";
import { getLastReadMessageId, markProjectMessagesRead } from "../repositories/project-message-read-repo.js";
import {
    countUnreadProjectMessages,
    createProjectMessage as saveMessage,
    deleteProjectMessage,
    getLatestProjectMessageId,
    getProjectMessageById,
    getProjectMessagesPage,
    projectMessageRepo,
    updateProjectMessage,
} from "../repositories/project-message-repo.js";
import { getProjectById, getProjectsByManagerId } from "../repositories/project-repo.js";
import { requireInReach } from "../services/company-scope.js";
import { canManageProject, projectAudienceIds, requireProjectMember } from "../services/project-access.js";
import { realtime } from "../services/realtime.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Mensagem não encontrada";
const PROJECT_NOT_FOUND = "Projeto não encontrado";
const EVENT = "project_message";

const toResponse = (message: ProjectMessage): ProjectMessageResponse => ({
    id: message.id,
    projectId: message.projectId,
    authorId: message.authorId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
});

/** O projeto do :id: 404 se não se vê, 403 se se vê mas a pessoa não está nele. */
async function requireChatProject(actor: User, req: Request): Promise<Project> {
    const project = requireInReach(actor, await getProjectById(uuidParam(req.params.id, PROJECT_NOT_FOUND)), PROJECT_NOT_FOUND);

    await requireProjectMember(actor, project, "Só quem está no projeto vê as mensagens");

    return project;
}

/** Uma mensagem deste projeto. A de outro projeto é o mesmo 404 de uma que não existe. */
async function requireMessage(project: Project, req: Request): Promise<ProjectMessage> {
    const message = await getProjectMessageById(uuidParam(req.params.messageId, NOT_FOUND));

    if (!message || message.projectId !== project.id) {
        throw new HttpError(404, NOT_FOUND);
    }

    return message;
}

/**
 * Manda a mudança a quem pode ter o chat aberto. Quem escreveu também recebe,
 * para os outros separadores dele.
 */
async function push(project: Project, payload: unknown): Promise<void> {
    realtime.sendToUsers(await projectAudienceIds(project), EVENT, payload);
}

export const listProjectMessages = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListProjectMessagesQuery;
    const project = await requireChatProject(actor, req);

    const rows = await getProjectMessagesPage(project.id, { before: query.before, limit: query.limit + 1 });

    const items = rows.slice(0, query.limit);
    const last = items.at(-1);

    const data: ProjectMessagePageResponse = {
        items: items.map(toResponse),
        nextBefore: rows.length > query.limit && last ? last.id : null,
        lastReadMessageId: await getLastReadMessageId(project.id, actor.id),
    };

    return new HttpResponse(200, "Mensagens", undefined, data).send(res);
}

export const createProjectMessage = async (req: Request, res: Response) => {
    const body = req.body as CreateProjectMessageRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireChatProject(actor, req);

    const created = await saveMessage(
        projectMessageRepo.create({
            projectId: project.id,
            authorId: actor.id,
            body: body.body,
        }),
    );

    await markProjectMessagesRead(project.id, actor.id, created.id);

    const data = toResponse(created);

    await push(project, { action: "created", message: data });

    return new HttpResponse(201, "Mensagem enviada", undefined, data).send(res);
}

export const patchProjectMessage = async (req: Request, res: Response) => {
    const body = req.body as PatchProjectMessageRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireChatProject(actor, req);
    const message = await requireMessage(project, req);

    // Nem um admin muda o que outra pessoa escreveu: pode apagar, não reescrever.
    if (message.authorId !== actor.id) {
        throw new HttpError(403, "Só quem escreveu a mensagem a pode alterar");
    }

    message.body = body.body;
    message.editedAt = new Date();

    const data = toResponse(await updateProjectMessage(message));

    await push(project, { action: "updated", message: data });

    return new HttpResponse(200, "Mensagem atualizada", undefined, data).send(res);
}

export const removeProjectMessage = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireChatProject(actor, req);
    const message = await requireMessage(project, req);

    if (message.authorId !== actor.id && !canManageProject(actor, project)) {
        throw new HttpError(403, "Só quem escreveu, o gestor do projeto ou um admin apaga esta mensagem");
    }

    await deleteProjectMessage(message.id);

    await push(project, { action: "deleted", projectId: project.id, id: message.id });

    return new HttpResponse(200, "Mensagem apagada").send(res);
}

/** Marca o chat como lido até à mais recente. Com o chat vazio, não há nada a marcar. */
export const readProjectMessages = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireChatProject(actor, req);

    const latest = await getLatestProjectMessageId(project.id);

    if (latest) {
        await markProjectMessagesRead(project.id, actor.id, latest);
    }

    return new HttpResponse(200, "Mensagens lidas", undefined, { lastReadMessageId: latest }).send(res);
}

/**
 * As por ler nos projetos em que a pessoa está ou que gere. Um admin que não
 * está num projeto lê o chat dele, mas não conta para aqui: seriam todos.
 */
export const getMyUnreadProjectMessages = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);

    const involved = await getInvolvedProjectIdsByUserId(actor.id);
    const managed = (await getProjectsByManagerId(actor.id)).map((project) => project.id);

    const counts = await countUnreadProjectMessages(actor.id, [...new Set([...involved, ...managed])]);

    const data: UnreadProjectMessagesResponse = {
        total: [...counts.values()].reduce((sum, unread) => sum + unread, 0),
        projects: [...counts].map(([projectId, unread]) => ({ projectId, unread })),
    };

    return new HttpResponse(200, "Mensagens por ler", undefined, data).send(res);
}
