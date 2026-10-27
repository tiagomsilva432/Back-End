import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import type { Project } from "../entities/Project.js";
import type { ProjectTask } from "../entities/ProjectTask.js";
import type { User } from "../entities/User.js";
import { TaskStatus } from "../types/enums.js";
import { canManageProject } from "./project-access.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type ProjectRef = Pick<Project, "id" | "companyId" | "managerId">;
type TaskRef = Pick<ProjectTask, "status" | "assigneeId">;

/**
 * Quem pode pôr uma tarefa numa coluna (ou mudá-la de lugar dentro da mesma):
 * - entre todo, in_progress e review: o responsável, ou quem gere o projeto.
 *   Uma tarefa sem responsável move-a qualquer pessoa do projeto;
 * - para done, só a partir de review, e só quem gere o projeto (é a aprovação);
 * - para fora de done, ou dentro de done: só quem gere o projeto.
 *
 * "Quem gere" é o canManageProject: o gestor, um company_admin, um system_admin.
 * Lança o erro, ou não faz nada se a mudança for permitida.
 */
export function checkTaskMove(actor: Actor, project: ProjectRef, task: TaskRef, toStatus: TaskStatus): void {
    const manages = canManageProject(actor, project);

    if (toStatus === TaskStatus.Done && task.status !== TaskStatus.Review && task.status !== TaskStatus.Done) {
        throw invalidData([{ field: "status", message: "Uma tarefa só passa a concluída depois da revisão" }]);
    }

    if (task.status === TaskStatus.Done || toStatus === TaskStatus.Done) {
        if (!manages) {
            throw new HttpError(403, "Só o gestor do projeto ou um admin aprova tarefas");
        }
        return;
    }

    if (!manages && task.assigneeId !== null && task.assigneeId !== actor.id) {
        throw new HttpError(403, "Só o responsável pela tarefa, o gestor ou um admin a move");
    }
}
