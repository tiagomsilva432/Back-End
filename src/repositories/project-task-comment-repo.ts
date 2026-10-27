import { AppDataSource } from "../data-source.js";
import { ProjectTaskComment } from "../entities/ProjectTaskComment.js";

export const projectTaskCommentRepo = AppDataSource.getRepository(ProjectTaskComment);

export async function getProjectTaskCommentById(id: string): Promise<ProjectTaskComment | null> {
    return await projectTaskCommentRepo.findOneBy({
        id
    });
}

/** Todos, do mais antigo para o mais recente: o id é uuidv7, que ordena pelo tempo. */
export async function getCommentsByTaskId(taskId: string): Promise<ProjectTaskComment[]> {
    return await projectTaskCommentRepo.find({
        where: { taskId },
        order: { id: "ASC" }
    });
}

/** Quantos comentários tem cada tarefa, numa query. As que não têm ficam de fora. */
export async function countCommentsByTaskIds(taskIds: string[]): Promise<Map<string, number>> {
    if (taskIds.length === 0) {
        return new Map();
    }

    const rows = await projectTaskCommentRepo
        .createQueryBuilder("c")
        .select("c.taskId", "taskId")
        .addSelect("COUNT(*)", "count")
        .where("c.taskId IN (:...taskIds)", { taskIds })
        .groupBy("c.taskId")
        .getRawMany<{ taskId: string; count: string }>();

    // O COUNT do Postgres é um bigint, e chega como string.
    return new Map(rows.map((row) => [row.taskId, Number(row.count)]));
}

export async function createProjectTaskComment(comment: ProjectTaskComment) {
    return await projectTaskCommentRepo.save(comment);
}

export async function updateProjectTaskComment(comment: ProjectTaskComment) {
    return await projectTaskCommentRepo.save(comment);
}

export async function deleteProjectTaskComment(id: string) {
    return await projectTaskCommentRepo.delete({
        id
    });
}
