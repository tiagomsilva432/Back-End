import { AppDataSource } from "../data-source.js";
import { ProjectMessageRead } from "../entities/ProjectMessageRead.js";

export const projectMessageReadRepo = AppDataSource.getRepository(ProjectMessageRead);

export async function getLastReadMessageId(projectId: string, userId: string): Promise<string | null> {
    const read = await projectMessageReadRepo.findOneBy({
        projectId,
        userId
    });

    return read?.lastReadMessageId ?? null;
}

/**
 * Põe a marca de uma pessoa nesta mensagem. Quem chama passa sempre a mais
 * recente do chat, por isso a marca só anda para a frente.
 */
export async function markProjectMessagesRead(projectId: string, userId: string, lastReadMessageId: string): Promise<void> {
    await projectMessageReadRepo.upsert({ projectId, userId, lastReadMessageId }, ["projectId", "userId"]);
}
