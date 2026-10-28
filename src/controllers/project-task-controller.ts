import type { Request, Response } from "express";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { FileResponse } from "../dtos/file/file-dto.js";
import type {
    CreateProjectTaskRequest,
    MoveProjectTaskRequest,
    PatchProjectTaskRequest,
    ProjectBoardQuery,
    ProjectBoardResponse,
    ProjectTaskResponse,
} from "../dtos/project/project-task-dto.js";
import type { Project } from "../entities/Project.js";
import type { ProjectTask } from "../entities/ProjectTask.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { countCommentsByTaskIds } from "../repositories/project-task-comment-repo.js";
import {
    createProjectTaskAtBottom,
    deleteProjectTask,
    getProjectTaskLabels,
    getProjectTasks,
    moveProjectTask,
    projectTaskRepo,
    updateProjectTask,
} from "../repositories/project-task-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { fileHandlers } from "../services/files/file-handlers.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { filesFor, removeFilesOf } from "../services/files/files.js";
import { notifier } from "../services/notifier.js";
import { canManageProject, isProjectMember } from "../services/project-access.js";
import { pushToBoard, requireBoardProject, requireBoardTask } from "../services/project-board.js";
import { checkTaskMove } from "../services/task-workflow.js";
import { FileKind, TaskPriority, TaskStatus, UserStatus } from "../types/enums.js";

const EVENT = "project_task";

const toResponse = (task: ProjectTask, attachments: FileResponse[], commentCount: number): ProjectTaskResponse => ({
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    position: task.position,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    priority: task.priority,
    labels: task.labels,
    createdBy: task.createdBy,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    commentCount,
    attachments,
});

/** Os cartões como a API os devolve: os anexos e os comentários de todos, em duas queries. */
async function cardsOf(tasks: ProjectTask[]): Promise<ProjectTaskResponse[]> {
    const ids = tasks.map((task) => task.id);
    const attachments = await filesFor(FileKind.TaskAttachment, ids);
    const comments = await countCommentsByTaskIds(ids);

    return tasks.map((task) => toResponse(task, attachments.get(task.id) ?? [], comments.get(task.id) ?? 0));
}

const cardOf = async (task: ProjectTask): Promise<ProjectTaskResponse> => (await cardsOf([task]))[0]!;

/**
 * O responsável tem de poder usar o quadro: alguém ativo da empresa do projeto
 * que lá esteja. Um id desconhecido ou de outra empresa dá o mesmo erro, para
 * não confirmar que existe.
 */
async function requireAssignee(project: Project, assigneeId: string): Promise<void> {
    const user = await getUserById(assigneeId);

    if (
        !user
        || user.companyId !== project.companyId
        || user.status !== UserStatus.Active
        || !(await isProjectMember(user, project))
    ) {
        throw invalidData([{ field: "assigneeId", message: "Tem de estar no projeto" }]);
    }
}

const taskRef = (project: Project, task: ProjectTask) => ({
    taskId: task.id,
    taskTitle: task.title,
    projectId: project.id,
    projectName: project.name,
});

/** Quem passa a ser o responsável sabe. Quem se atribuiu a si próprio, não. */
async function notifyAssigned(actor: User, project: Project, task: ProjectTask): Promise<void> {
    await notifier.notify("task.assigned", {
        companyId: project.companyId,
        recipientIds: [task.assigneeId],
        exclude: [actor.id],
        data: taskRef(project, task),
    });
}

export const getProjectBoard = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ProjectBoardQuery;
    const project = await requireBoardProject(actor, req);

    const cards = await cardsOf(await getProjectTasks(project.id, query));

    const board: ProjectBoardResponse = { todo: [], in_progress: [], review: [], done: [] };

    for (const card of cards) {
        board[card.status].push(card);
    }

    return new HttpResponse(200, "Quadro do projeto", undefined, board).send(res);
}

export const listProjectTaskLabels = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);

    return new HttpResponse(200, "Etiquetas", undefined, await getProjectTaskLabels(project.id)).send(res);
}

export const createProjectTask = async (req: Request, res: Response) => {
    const body = req.body as CreateProjectTaskRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);

    if (body.assigneeId) {
        await requireAssignee(project, body.assigneeId);
    }

    const created = await createProjectTaskAtBottom(
        projectTaskRepo.create({
            projectId: project.id,
            title: body.title,
            description: body.description ?? null,
            status: body.status ?? TaskStatus.Todo,
            assigneeId: body.assigneeId ?? null,
            dueDate: body.dueDate ?? null,
            priority: body.priority ?? TaskPriority.Medium,
            labels: body.labels ?? [],
            createdBy: actor.id,
            completedAt: null,
        }),
    );

    await notifyAssigned(actor, project, created);

    // Uma tarefa nova não tem anexos nem comentários.
    const data = toResponse(created, [], 0);

    await pushToBoard(project, EVENT, { action: "created", task: data });

    return new HttpResponse(201, "Tarefa criada", undefined, data).send(res);
}

export const getProjectTask = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);

    return new HttpResponse(200, "Tarefa", undefined, await cardOf(task)).send(res);
}

export const patchProjectTask = async (req: Request, res: Response) => {
    const body = req.body as PatchProjectTaskRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);

    const previousAssigneeId = task.assigneeId;

    if (body.assigneeId && body.assigneeId !== task.assigneeId) {
        await requireAssignee(project, body.assigneeId);
    }

    if (body.title !== undefined) {
        task.title = body.title;
    }

    if (body.description !== undefined) {
        task.description = body.description;
    }

    if (body.assigneeId !== undefined) {
        task.assigneeId = body.assigneeId;
    }

    if (body.dueDate !== undefined) {
        task.dueDate = body.dueDate;
    }

    if (body.priority !== undefined) {
        task.priority = body.priority;
    }

    if (body.labels !== undefined) {
        task.labels = body.labels;
    }

    const saved = await updateProjectTask(task);

    if (saved.assigneeId !== previousAssigneeId) {
        await notifyAssigned(actor, project, saved);
    }

    const data = await cardOf(saved);

    await pushToBoard(project, EVENT, { action: "updated", task: data });

    return new HttpResponse(200, "Tarefa atualizada", undefined, data).send(res);
}

/**
 * Arrastar um cartão. As regras (quem move, e que só se chega a done a partir
 * de review) estão em task-workflow.ts, e correm com o quadro já trancado.
 */
export const moveTask = async (req: Request, res: Response) => {
    const body = req.body as MoveProjectTaskRequest;
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const target = await requireBoardTask(project, req);

    const { task, from, order } = await moveProjectTask(target, body.status, body.position, (current) =>
        checkTaskMove(actor, project, current, body.status),
    );

    if (task.status === TaskStatus.Review && from !== TaskStatus.Review) {
        await notifier.notify("task.review_requested", {
            companyId: project.companyId,
            recipientIds: [project.managerId],
            exclude: [actor.id],
            data: taskRef(project, task),
        });
    }

    // Sair de review é a decisão: aprovada se foi para done, devolvida se voltou atrás.
    if (from === TaskStatus.Review && task.status !== TaskStatus.Review) {
        await notifier.notify("task.reviewed", {
            companyId: project.companyId,
            recipientIds: [task.assigneeId],
            exclude: [actor.id],
            data: { ...taskRef(project, task), approved: task.status === TaskStatus.Done },
        });
    }

    const data = { task: await cardOf(task), order };

    await pushToBoard(project, EVENT, { action: "moved", ...data });

    return new HttpResponse(200, "Tarefa movida", undefined, data).send(res);
}

export const removeProjectTask = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const project = await requireBoardProject(actor, req);
    const task = await requireBoardTask(project, req);

    if (task.createdBy !== actor.id && !canManageProject(actor, project)) {
        throw new HttpError(403, "Só quem criou a tarefa, o gestor do projeto ou um administrador a apaga");
    }

    // Os comentários vão pelo CASCADE.
    await deleteProjectTask(task.id);

    // Depois da tarefa: um anexo que fique para trás apanha-o o files:sweep.
    await removeFilesOf(FileKind.TaskAttachment, task.id);

    await pushToBoard(project, EVENT, { action: "deleted", projectId: project.id, id: task.id });

    return new HttpResponse(200, "Tarefa apagada").send(res);
}

/**
 * Qualquer pessoa do projeto anexa e tira ficheiros, como altera o resto do
 * cartão. O quadro recebe o cartão atualizado, com a lista nova.
 */
const pushCard = async (project: Project, task: ProjectTask): Promise<void> => {
    await pushToBoard(project, EVENT, { action: "updated", task: await cardOf(task) });
};

const attachments = fileHandlers<{ project: Project; task: ProjectTask }>(FILE_KINDS[FileKind.TaskAttachment], {
    requireOwner: async (actor, req) => {
        const project = await requireBoardProject(actor, req);
        const task = await requireBoardTask(project, req);

        return { companyId: project.companyId, ownerId: task.id, owner: { project, task } };
    },
    afterUpload: async (_actor, { project, task }) => pushCard(project, task),
    afterRemove: async (_actor, { project, task }) => pushCard(project, task),
    messages: { uploaded: "Anexo adicionado", removed: "Anexo apagado", notFound: "Anexo não encontrado" },
});

export const uploadTaskAttachment = attachments.upload;
export const removeTaskAttachment = attachments.remove;
