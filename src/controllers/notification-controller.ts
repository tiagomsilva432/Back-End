import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    ListMyNotificationsQuery,
    NotificationPageResponse,
} from "../dtos/notification/notification-dto.js";
import type { User } from "../entities/User.js";
import { getAuth } from "../middleware/requireAuth.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    countUnreadNotifications,
    getNotificationById,
    getNotificationsByRecipientId,
    markAllNotificationsRead,
    updateNotification,
} from "../repositories/notification-repo.js";
import { toNotificationResponse } from "../services/notification-mapper.js";
import { realtime } from "../services/realtime.js";
import { streamTickets } from "../services/stream-tickets.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Notificação não encontrada";

export const listMyNotifications = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListMyNotificationsQuery;

    const rows = await getNotificationsByRecipientId(actor.id, {
        unread: query.unread,
        before: query.before,
        limit: query.limit + 1,
    });

    const items = rows.slice(0, query.limit);
    const last = items.at(-1);

    const data: NotificationPageResponse = {
        items: items.map(toNotificationResponse),
        nextBefore: rows.length > query.limit && last ? last.id : null,
    };

    return new HttpResponse(200, "Notificações", undefined, data).send(res);
}

export const getMyUnreadCount = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);

    const unread = await countUnreadNotifications(actor.id);

    return new HttpResponse(200, "Notificações por ler", undefined, { unread }).send(res);
}

/** A de outra pessoa dá o mesmo 404 de uma que não existe. Ler duas vezes guarda a primeira hora. */
export const readNotification = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const notification = await getNotificationById(id);

    if (!notification || notification.recipientId !== actor.id) {
        throw new HttpError(404, NOT_FOUND);
    }

    if (!notification.readAt) {
        notification.readAt = new Date();
        await updateNotification(notification);
    }

    return new HttpResponse(200, "Notificação lida", undefined, toNotificationResponse(notification)).send(res);
}

export const readAllMyNotifications = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);

    const updated = await markAllNotificationsRead(actor.id, new Date());

    return new HttpResponse(200, "Notificações lidas", undefined, { updated }).send(res);
}

export const createStreamTicket = async (req: Request, res: Response) => {
    const data = streamTickets.issue(getAuth(req));

    return new HttpResponse(201, "Bilhete criado", undefined, data).send(res);
}

/**
 * Abre o stream e devolve logo: a resposta fica aberta no hub até o cliente
 * sair, o token expirar, a conta deixar de estar ativa ou o servidor parar.
 * O `ready` já leva o número por ler, para o sino ficar certo de imediato.
 */
export const openNotificationStream = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const { exp } = getAuth(req);

    const unread = await countUnreadNotifications(actor.id);

    realtime.attach(res, actor, exp * 1000, { unread });
}
