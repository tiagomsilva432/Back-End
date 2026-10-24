import type { NotificationResponse } from "../dtos/notification/notification-dto.js";
import type { Notification } from "../entities/Notification.js";
import { renderNotificationMessage } from "./notification-catalog.js";

/** Entidade -> DTO. A mensagem não se grava: sai do catálogo na altura. */
export const toNotificationResponse = (notification: Notification): NotificationResponse => ({
    id: notification.id,
    type: notification.type,
    message: renderNotificationMessage(notification.type, notification.data),
    data: notification.data,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
});
