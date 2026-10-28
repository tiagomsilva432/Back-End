import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    ProjectTaskCommentRequest,
    ProjectTaskCommentResponse,
} from "../dtos/project/project-task-comment-dto.js";
import type { ProjectTask } from "../entities/ProjectTask.js";
import type { ProjectTaskComment } from "../entities/ProjectTaskComment.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    createProjectTaskComment as saveComment,
    deleteProjectTaskComment,
    getCommentsByTaskId,
    getProjectTaskCommentById,
    projectTaskCommentRepo,
    updateProjectTaskComment,
} from "../repositories/project-task-comment-repo.js";
import { notifier } from "../services/notifier.js";
import { canManageProject } from "../services/project-access.js";
import { pushToBoard, requireBoardProject, requireBoardTask } from "../services/project-board.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Comentário não encontrado";
const EVENT = "project_task_comment";

const toResponse = (comment: ProjectTaskComment): ProjectTaskCommentResponse => ({
    id: comment.id,
    taskId: comment.taskId,
    authorId: comment.authorId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
});

/** Um comentário desta tarefa. O de outra tarefa é o mesmo 404 de um que não existe. */
async function requireComment(task: ProjectTask, req: Request): Promise<ProjectTaskComment> {
    const comment = await getProjectTaskCommentById(uuidParam(req.params.commentId, NOT_FOUND));

    if (!comment || comment.taskId !== task.id) {
        throw new HttpError(404, NOT_FOUND);
    }

    return comment;
}

export const listTaskComments = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);

    const comments = await getCommentsByTaskId(task.id);

    return new HttpResponse(200, "Comentários", undefined, comments.map(toResponse)).send(res);
}

export const createTaskComment = async (req: Request, res: Response) => {
    const body = req.body as ProjectTaskCommentRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);

    const created = await saveComment(
        projectTaskCommentRepo.create({
            taskId: task.id,
            authorId: actor.id,
            body: body.body,
        }),
    );

    // O responsável e quem criou a tarefa seguem-na; quem comentou já sabe.
    await notifier.notify("task.commented", {
        companyId: project.companyId,
        recipientIds: [task.assigneeId, task.createdBy],
        exclude: [actor.id],
        data: { taskId: task.id, taskTitle: task.title, projectId: project.id, projectName: project.name },
    });

    const data = toResponse(created);

    await pushToBoard(project, EVENT, { action: "created", projectId: project.id, comment: data });

    return new HttpResponse(201, "Comentário adicionado", undefined, data).send(res);
}

export const patchTaskComment = async (req: Request, res: Response) => {
    const body = req.body as ProjectTaskCommentRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);
    const comment = await requireComment(task, req);

    // Como no chat: quem gere pode apagar, não reescrever.
    if (comment.authorId !== actor.id) {
        throw new HttpError(403, "Só quem escreveu o comentário o pode alterar");
    }

    comment.body = body.body;
    comment.editedAt = new Date();

    const data = toResponse(await updateProjectTaskComment(comment));

    await pushToBoard(project, EVENT, { action: "updated", projectId: project.id, comment: data });

    return new HttpResponse(200, "Comentário atualizado", undefined, data).send(res);
}

export const removeTaskComment = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);
    const comment = await requireComment(task, req);

    if (comment.authorId !== actor.id && !canManageProject(actor, project)) {
        throw new HttpError(403, "Só quem escreveu, o gestor do projeto ou um administrador apaga este comentário");
    }

    await deleteProjectTaskComment(comment.id);

    await pushToBoard(project, EVENT, { action: "deleted", projectId: project.id, taskId: task.id, id: comment.id });

    return new HttpResponse(200, "Comentário apagado").send(res);
}
