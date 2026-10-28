import { ArrayContains, type EntityManager } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Project } from "../entities/Project.js";
import { ProjectTask } from "../entities/ProjectTask.js";
import { type TaskPriority, TaskStatus } from "../types/enums.js";

export const projectTaskRepo = AppDataSource.getRepository(ProjectTask);

export async function getProjectTaskById(id: string): Promise<ProjectTask | null> {
    return await projectTaskRepo.findOneBy({
        id
    });
}

export interface ProjectTaskFilter {
    assigneeId?: string | undefined;
    label?: string | undefined;
    priority?: TaskPriority | undefined;
}

/** As tarefas de um projeto, já pela ordem de cada coluna. Quem chama agrupa-as pelo status. */
export async function getProjectTasks(projectId: string, filter: ProjectTaskFilter = {}): Promise<ProjectTask[]> {
    return await projectTaskRepo.find({
        where: {
            projectId,
            ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
            ...(filter.label ? { labels: ArrayContains([filter.label]) } : {}),
            ...(filter.priority ? { priority: filter.priority } : {}),
        },
        order: { position: "ASC", id: "ASC" },
    });
}

/** As etiquetas usadas no projeto, sem repetidas e por ordem: para o autocomplete. */
export async function getProjectTaskLabels(projectId: string): Promise<string[]> {
    const rows = await projectTaskRepo
        .createQueryBuilder("t")
        .select("DISTINCT unnest(t.labels)", "label")
        .where("t.projectId = :projectId", { projectId })
        .orderBy("label", "ASC")
        .getRawMany<{ label: string }>();

    return rows.map((row) => row.label);
}

/**
 * Tranca o projeto até ao fim da transação: duas escritas no mesmo quadro
 * (um move e um create, dois moves) esperam uma pela outra e nunca baralham
 * as posições.
 */
async function lockBoard(manager: EntityManager, projectId: string): Promise<void> {
    await manager.getRepository(Project)
        .createQueryBuilder("p")
        .setLock("pessimistic_write")
        .where("p.id = :projectId", { projectId })
        .getOne();
}

const byPosition = (a: ProjectTask, b: ProjectTask): number =>
    a.position - b.position || (a.id < b.id ? -1 : 1);

async function columnOf(manager: EntityManager, projectId: string, status: TaskStatus): Promise<ProjectTask[]> {
    return (await manager.getRepository(ProjectTask).findBy({ projectId, status })).sort(byPosition);
}

export async function createProjectTaskAtBottom(task: ProjectTask): Promise<ProjectTask> {
    return await projectTaskRepo.manager.transaction(async (manager) => {
        await lockBoard(manager, task.projectId);

        const column = await columnOf(manager, task.projectId, task.status);
        task.position = column.length === 0 ? 0 : Math.max(...column.map((t) => t.position)) + 1;

        return await manager.getRepository(ProjectTask).save(task);
    });
}

export interface MovedTask {
    task: ProjectTask;
    from: TaskStatus;
    /** A ordem nova de cada coluna afetada, de cima para baixo. */
    order: Partial<Record<TaskStatus, string[]>>;
}

/**
 * Põe a tarefa na coluna `toStatus`, no lugar `toIndex` (a contar de 0, e
 * acima do fim fica no fim), e renumera a coluna de destino e a de origem.
 *
 * O `check` corre já com o quadro trancado, sobre a tarefa lida outra vez: as
 * regras (ver task-workflow.ts) olham para a coluna em que ela está mesmo, e
 * não para a de antes de esperar pela tranca. Null se a tarefa foi apagada
 * entretanto.
 */
export async function moveProjectTask(
    target: Pick<ProjectTask, "id" | "projectId">,
    toStatus: TaskStatus,
    toIndex: number,
    check: (current: ProjectTask) => void,
): Promise<MovedTask | null> {
    return await projectTaskRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(ProjectTask);
        const { projectId } = target;

        await lockBoard(manager, projectId);

        const task = await repo.findOneBy({ id: target.id });

        if (!task) {
            return null;
        }

        check(task);

        const from = task.status;
        const destination = (await columnOf(manager, projectId, toStatus)).filter((t) => t.id !== task.id);
        destination.splice(Math.min(toIndex, destination.length), 0, task);

        if (toStatus === TaskStatus.Done && from !== TaskStatus.Done) {
            task.completedAt = new Date();
        } else if (toStatus !== TaskStatus.Done) {
            task.completedAt = null;
        }
        task.status = toStatus;

        const columns = [destination];

        if (from !== toStatus) {
            columns.push((await columnOf(manager, projectId, from)).filter((t) => t.id !== task.id));
        }

        const changed = new Set<ProjectTask>([task]);

        for (const column of columns) {
            column.forEach((t, index) => {
                if (t.position !== index) {
                    t.position = index;
                    changed.add(t);
                }
            });
        }

        await repo.save([...changed]);

        const order: Partial<Record<TaskStatus, string[]>> = { [toStatus]: destination.map((t) => t.id) };

        if (from !== toStatus) {
            order[from] = (columns[1] ?? []).map((t) => t.id);
        }

        return { task, from, order };
    });
}

/**
 * Altera o cartão com o quadro trancado, sobre a tarefa lida outra vez: gravar a
 * de antes da tranca desfazia um move feito entretanto (a coluna, o lugar, o
 * completedAt). O `apply` faz as verificações e muda os campos. Null se a
 * tarefa foi apagada entretanto.
 */
export async function updateProjectTask(
    target: Pick<ProjectTask, "id" | "projectId">,
    apply: (current: ProjectTask) => Promise<void>,
): Promise<ProjectTask | null> {
    return await projectTaskRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(ProjectTask);

        await lockBoard(manager, target.projectId);

        const task = await repo.findOneBy({ id: target.id });

        if (!task) {
            return null;
        }

        await apply(task);

        return await repo.save(task);
    });
}

export async function deleteProjectTask(id: string) {
    return await projectTaskRepo.delete({
        id
    });
}
