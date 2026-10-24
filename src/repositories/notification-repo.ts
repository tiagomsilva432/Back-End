import { IsNull, LessThan } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Notification } from "../entities/Notification.js";

export const notificationRepo = AppDataSource.getRepository(Notification);

export async function getNotificationById(id: string): Promise<Notification | null> {
    return await notificationRepo.findOneBy({
        id
    });
}

/**
 * Uma página da caixa de alguém. O id é uuidv7, que ordena pelo tempo, por isso
 * serve de cursor: a página seguinte é tudo o que é mais antigo do que `before`.
 */
export async function getNotificationsByRecipientId(
    recipientId: string,
    options: { unread: boolean; before?: string | undefined; limit: number },
): Promise<Notification[]> {
    return await notificationRepo.find({
        where: {
            recipientId,
            ...(options.before ? { id: LessThan(options.before) } : {}),
            ...(options.unread ? { readAt: IsNull() } : {}),
        },
        order: { id: "DESC" },
        take: options.limit,
    });
}

export async function countUnreadNotifications(recipientId: string): Promise<number> {
    return await notificationRepo.countBy({
        recipientId,
        readAt: IsNull()
    });
}

/**
 * Numa transação: nos testes passa a SAVEPOINT, e um insert que falhe não
 * estraga a transação do teste. Em produção corre depois de a escrita do
 * pedido já estar gravada, e é independente dela.
 */
export async function createNotifications(notifications: Notification[]): Promise<Notification[]> {
    return await notificationRepo.manager.transaction(async (manager) => await manager.save(notifications));
}

export async function updateNotification(notification: Notification) {
    return await notificationRepo.save(notification);
}

export async function markAllNotificationsRead(recipientId: string, readAt: Date): Promise<number> {
    const result = await notificationRepo.update({ recipientId, readAt: IsNull() }, { readAt });
    return result.affected ?? 0;
}
