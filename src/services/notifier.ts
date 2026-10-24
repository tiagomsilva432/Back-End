import { createNotifications, notificationRepo } from "../repositories/notification-repo.js";
import {
    notificationCatalog,
    type NotificationData,
    type NotificationType,
} from "./notification-catalog.js";
import { toNotificationResponse } from "./notification-mapper.js";
import { realtime } from "./realtime.js";

type MaybeId = string | null | undefined;

interface NotifyOptions<T extends NotificationType> {
    /** A empresa onde aconteceu (ver Notification.companyId). */
    companyId: string;
    /** Pode trazer nulls e repetidos: um managerId vazio, alguém em duas listas. */
    recipientIds: Iterable<MaybeId>;
    data: NotificationData<T>;
    /** Nunca notificados, mesmo que estejam na lista: quem fez a ação, ou um avaliado. */
    exclude?: readonly MaybeId[];
}

/**
 * Grava uma notificação por pessoa e avisa quem estiver ligado. Chama-se depois
 * de a escrita do pedido correr bem, e com await antes de responder.
 *
 * Nunca falha o pedido, como o email: uma notificação que não sai fica no log.
 */
async function notify<T extends NotificationType>(type: T, options: NotifyOptions<T>): Promise<void> {
    const excluded = new Set<MaybeId>(options.exclude ?? []);
    const recipients = [...new Set(options.recipientIds)]
        .filter((id): id is string => Boolean(id) && !excluded.has(id));

    // Sem destinatários não há query nenhuma.
    if (recipients.length === 0) {
        return;
    }

    try {
        const data = notificationCatalog[type].data.parse(options.data) as Record<string, unknown>;

        const saved = await createNotifications(
            recipients.map((recipientId) => notificationRepo.create({
                recipientId,
                companyId: options.companyId,
                type,
                data,
                readAt: null,
            })),
        );

        for (const notification of saved) {
            realtime.sendToUsers([notification.recipientId], "notification", toNotificationResponse(notification));
        }
    } catch (error) {
        console.error(`Falha ao criar a notificação ${type}`, error);
    }
}

/** Objeto e não exports soltos: é o que permite o jest.spyOn nos testes. */
export const notifier = { notify };
