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
            throw new HttpError(403, "Só o gestor do projeto ou um administrador aprova tarefas");
        }
        return;
    }

    if (!manages && task.assigneeId !== null && task.assigneeId !== actor.id) {
        throw new HttpError(403, "Só o responsável pela tarefa, o gestor ou um administrador a move");
    }
}

export interface TaskEditChanges {
    /** O título ou a descrição. */
    text?: boolean;
    /** O prazo, a prioridade, as etiquetas ou os anexos. */
    details?: boolean;
}

/**
 * Quem altera o conteúdo de um cartão (o responsável é com o checkAssignee):
 * - uma tarefa concluída: só quem gere o projeto, como para a mover;
 * - o título e a descrição: quem a criou, ou quem gere;
 * - o prazo, a prioridade, as etiquetas e os anexos: quem a criou, o responsável, ou quem gere.
 * Os outros do projeto só a veem e comentam.
 */
export function checkTaskEdit(
    actor: Actor,
    project: ProjectRef,
    task: Pick<ProjectTask, "status" | "createdBy" | "assigneeId">,
    changes: TaskEditChanges,
): void {
    if (canManageProject(actor, project)) {
        return;
    }

    if (task.status === TaskStatus.Done) {
        throw new HttpError(403, "Uma tarefa concluída só é alterada pelo gestor ou por um administrador");
    }

    if (changes.text && task.createdBy !== actor.id) {
        throw new HttpError(403, "Só quem criou a tarefa, o gestor ou um administrador altera o título e a descrição");
    }

    if (changes.details && task.createdBy !== actor.id && task.assigneeId !== actor.id) {
        throw new HttpError(403, "Só quem criou a tarefa, o responsável, o gestor ou um administrador alteram esta tarefa");
    }
}

/**
 * Quem gere atribui a qualquer pessoa do projeto. Os outros pegam numa tarefa
 * sem responsável só para si, e passam a outra pessoa (ou largam) só a que já é
 * sua: senão, mudar o responsável contornava o checkTaskMove. `task` é null numa
 * tarefa nova.
 */
export function checkAssignee(
    actor: Actor,
    project: ProjectRef,
    task: Pick<ProjectTask, "assigneeId"> | null,
    assigneeId: string | null,
): void {
    const current = task?.assigneeId ?? null;

    if (current === assigneeId || current === actor.id || canManageProject(actor, project)) {
        return;
    }

    if (current === null) {
        if (assigneeId === actor.id) {
            return;
        }
        throw new HttpError(403, "Só o gestor ou um administrador atribui tarefas a outras pessoas");
    }

    throw new HttpError(403, "Só o responsável, o gestor ou um administrador mudam o responsável desta tarefa");
}
