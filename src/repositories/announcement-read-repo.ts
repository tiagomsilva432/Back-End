import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { AnnouncementRead } from "../entities/AnnouncementRead.js";

export const announcementReadRepo = AppDataSource.getRepository(AnnouncementRead);

export async function getReadAnnouncementIds(userId: string, announcementIds: string[]): Promise<Set<string>> {
    if (announcementIds.length === 0) {
        return new Set();
    }

    const reads = await announcementReadRepo.find({
        select: { announcementId: true },
        where: { userId, announcementId: In(announcementIds) }
    });

    return new Set(reads.map((read) => read.announcementId));
}

/**
 * ON CONFLICT DO NOTHING: ler duas vezes guarda a primeira hora, e um conflito
 * nunca chega a ser um erro que abortasse a transação.
 */
export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
    await announcementReadRepo
        .createQueryBuilder()
        .insert()
        .into(AnnouncementRead)
        .values({ announcementId, userId })
        .orIgnore()
        .execute();
}
