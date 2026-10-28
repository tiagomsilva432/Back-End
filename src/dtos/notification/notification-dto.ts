import { z } from "zod";
import { flag } from "../common/fields-dto.js";

//Schema QUERY listMyNotifications
export const listMyNotificationsQuerySchema = z.object({
    unread: flag("Só as que ainda não foram lidas."),
    before: z.uuid().optional().meta({
        example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        description: "O `nextBefore` da página anterior. Sem ele, começa nas mais recentes.",
    }),
    limit: z.coerce.number().int().min(1).max(100).default(20)
        .meta({ example: 20, description: "Entre 1 e 100. Por omissão, 20." }),
}).meta({ id: "ListMyNotificationsQuery", description: "Filtros e página das notificações" });

//Schema QUERY stream (só para a documentação: o requireStreamAuth lê-o à mão)
export const notificationStreamQuerySchema = z.object({
    ticket: z.string().optional().meta({
        description: "O bilhete de `POST /notifications/stream-ticket`. Sem ele, o pedido tem de trazer o Bearer.",
    }),
}).meta({ id: "NotificationStreamQuery", description: "Autenticação do stream" });

//Como uma notificação é devolvida
export const notificationResponseSchema = z.object({
    id: z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" }),
    type: z.string().meta({ example: "allocation.created" }),
    message: z.string().meta({ example: "Tem uma nova alocação no projeto Website (50%)" }),
    data: z.record(z.string(), z.unknown()).meta({
        example: { projectId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", projectName: "Website" },
        description: "Depende do `type`: os ids para onde a notificação leva, e os nomes da altura.",
    }),
    readAt: z.iso.datetime().nullable().meta({ example: null, description: "null enquanto está por ler." }),
    createdAt: z.iso.datetime().meta({ example: "2026-10-24T09:30:00.000Z" }),
}).meta({ id: "Notification", description: "Uma notificação de uma pessoa" });

export const notificationPageResponseSchema = z.object({
    items: z.array(notificationResponseSchema),
    nextBefore: z.uuid().nullable().meta({
        example: null,
        description: "Passa-se como `before` para a página seguinte. null quando não há mais.",
    }),
}).meta({ id: "NotificationPage", description: "Notificações, da mais recente para a mais antiga" });

export const unreadCountResponseSchema = z.object({
    unread: z.int().meta({ example: 3 }),
}).meta({ id: "UnreadNotificationCount", description: "Quantas notificações estão por ler" });

export const readAllNotificationsResponseSchema = z.object({
    updated: z.int().meta({ example: 3 }),
}).meta({ id: "ReadAllNotificationsResult", description: "Quantas passaram a lidas" });

export const streamTicketResponseSchema = z.object({
    ticket: z.string().meta({ example: "q1x9_Z0...", description: "Serve uma vez." }),
    expiresInSeconds: z.int().meta({ example: 30 }),
}).meta({ id: "NotificationStreamTicket", description: "Bilhete para abrir o stream" });

export type ListMyNotificationsQuery = z.infer<typeof listMyNotificationsQuerySchema>;
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type NotificationPageResponse = z.infer<typeof notificationPageResponseSchema>;
