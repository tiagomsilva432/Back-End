import type { Request } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import type { Project } from "../entities/Project.js";
import type { ProjectTask } from "../entities/ProjectTask.js";
import type { User } from "../entities/User.js";
import { getProjectById } from "../repositories/project-repo.js";
import { getProjectTaskById } from "../repositories/project-task-repo.js";
import { uuidParam } from "../utils/params.js";
import { requireInReach } from "./company-scope.js";
import { projectAudienceIds, requireProjectMember } from "./project-access.js";
import { realtime } from "./realtime.js";

export const TASK_NOT_FOUND = "Tarefa não encontrada";
const PROJECT_NOT_FOUND = "Projeto não encontrado";

/** O projeto do :id: 404 se não se vê, 403 se se vê mas a pessoa não está nele. */
export async function requireBoardProject(actor: User, req: Request): Promise<Project> {
    const project = requireInReach(actor, await getProjectById(uuidParam(req.params.id, PROJECT_NOT_FOUND)), PROJECT_NOT_FOUND);

    await requireProjectMember(actor, project, "Só quem está no projeto vê as tarefas");

    return project;
}

/** A tarefa do :taskId, deste projeto. A de outro projeto é o mesmo 404 de uma que não existe. */
export async function requireBoardTask(project: Project, req: Request): Promise<ProjectTask> {
    const task = await getProjectTaskById(uuidParam(req.params.taskId, TASK_NOT_FOUND));

    if (!task || task.projectId !== project.id) {
        throw new HttpError(404, TASK_NOT_FOUND);
    }

    return task;
}

/** Manda uma mudança do quadro a quem o pode ter aberto, como o chat. */
export async function pushToBoard(project: Project, event: string, payload: unknown): Promise<void> {
    realtime.sendToUsers(await projectAudienceIds(project), event, payload);
}
