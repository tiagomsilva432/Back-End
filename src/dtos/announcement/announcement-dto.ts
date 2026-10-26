import { z } from "zod";
import { AnnouncementScope, AnnouncementSeverity } from "../../types/enums.js";

const idSchema = z.uuid().meta({ example: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42" });

const flag = (description: string) =>
    z.enum(["true", "false"]).optional().transform((v) => v === "true")
        .meta({ example: "true", description });

const titleSchema = z.string().trim().min(1).max(150).meta({ example: "Manutenção no sábado" });
const bodySchema = z.string().trim().min(1).max(5000)
    .meta({ example: "A plataforma vai estar indisponível no sábado entre as 08:00 e as 10:00." });
const severitySchema = z.enum(AnnouncementSeverity).meta({ example: AnnouncementSeverity.Warning });
const pinnedSchema = z.boolean().meta({ example: false, description: "Os fixados aparecem primeiro." });

// Com fuso: "2026-11-01T08:00:00Z" ou "2026-11-01T08:00:00+01:00".
const instantSchema = z.iso.datetime({ offset: true });

const startsAtSchema = instantSchema.meta({
    example: "2026-11-01T08:00:00Z",
    description: "Antes disto o aviso não aparece. Por omissão, já.",
});
const endsAtSchema = instantSchema.nullable().meta({
    example: "2026-11-01T10:00:00Z",
    description: "Depois disto deixa de aparecer. null (ou omitido) fica até ser apagado.",
});

// O que todos os avisos têm. A janela compara-se no controller, também nos PATCH.
const content = {
    title: titleSchema,
    body: bodySchema,
    severity: severitySchema.default(AnnouncementSeverity.Info),
    pinned: pinnedSchema.default(false),
    startsAt: startsAtSchema.optional(),
    endsAt: endsAtSchema.optional(),
};

//Schema REQUEST createAnnouncement
export const createAnnouncementSchema = z.discriminatedUnion("scope", [
    z.object({
        scope: z.literal(AnnouncementScope.System),
        ...content,
    }),
    z.object({
        scope: z.literal(AnnouncementScope.Company),
        companyId: idSchema.optional().meta({
            description: "Obrigatório para um system_admin. Um company_admin publica sempre na sua.",
        }),
        ...content,
    }),
    z.object({
        scope: z.literal(AnnouncementScope.Project),
        projectId: idSchema,
        ...content,
    }),
]).meta({ id: "CreateAnnouncementRequest", description: "Publicar um aviso. O `scope` decide quem o vê." });

/** Junta, como os outros PATCH. O scope, a empresa e o projeto não mudam: apaga-se e publica-se outro. */
export const patchAnnouncementSchema = z.object({
    title: titleSchema.optional(),
    body: bodySchema.optional(),
    severity: severitySchema.optional(),
    pinned: pinnedSchema.optional(),
    startsAt: startsAtSchema.optional(),
    endsAt: endsAtSchema.optional(),
})
    .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para alterar" })
    .meta({ id: "PatchAnnouncementRequest", description: "Alterar um aviso" });

//Schemas QUERY
export const listMyAnnouncementsQuerySchema = z.object({
    unread: flag("Só os que ainda não foram lidos."),
}).meta({ id: "ListMyAnnouncementsQuery", description: "Filtros dos meus avisos" });

export const listProjectAnnouncementsQuerySchema = z.object({
    includeInactive: flag("Também os agendados e os que já acabaram. Só conta para quem gere o projeto."),
}).meta({ id: "ListProjectAnnouncementsQuery", description: "Filtros dos avisos de um projeto" });

export const listAnnouncementsQuerySchema = z.object({
    scope: z.string().trim().toLowerCase().pipe(z.enum(AnnouncementScope)).optional()
        .meta({ example: AnnouncementScope.Company }),
    companyId: idSchema.optional().meta({ description: "Só para um system_admin." }),
    projectId: idSchema.optional(),
    includeInactive: flag("Também os agendados e os que já acabaram."),
}).meta({ id: "ListAnnouncementsQuery", description: "Filtros dos avisos que se gerem" });

//Como um aviso é devolvido
export const announcementResponseSchema = z.object({
    id: idSchema,
    scope: z.enum(AnnouncementScope).meta({ example: AnnouncementScope.Company }),
    companyId: z.uuid().nullable().meta({ description: "null nos avisos de sistema." }),
    projectId: z.uuid().nullable().meta({ description: "Só nos avisos de projeto." }),
    createdBy: z.uuid(),
    title: z.string().meta({ example: "Manutenção no sábado" }),
    body: z.string(),
    severity: z.enum(AnnouncementSeverity).meta({ example: AnnouncementSeverity.Warning }),
    pinned: z.boolean(),
    startsAt: z.iso.datetime().meta({ example: "2026-11-01T08:00:00.000Z" }),
    endsAt: z.iso.datetime().nullable().meta({ example: "2026-11-01T10:00:00.000Z" }),
    active: z.boolean().meta({ description: "Se aparece agora: já começou e ainda não acabou." }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: "Announcement", description: "Um aviso" });

/** O mesmo aviso visto por alguém: com o que essa pessoa já leu. */
export const announcementFeedItemSchema = announcementResponseSchema.extend({
    read: z.boolean().meta({ example: false }),
}).meta({ id: "AnnouncementFeedItem", description: "Um aviso, e se quem pergunta já o leu" });

export const announcementListResponseSchema = z.array(announcementResponseSchema)
    .meta({ id: "AnnouncementList", description: "Avisos, fixados primeiro e depois do mais recente" });

export const announcementFeedResponseSchema = z.array(announcementFeedItemSchema)
    .meta({ id: "AnnouncementFeed", description: "Avisos, fixados primeiro e depois do mais recente" });

export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementSchema>;
export type PatchAnnouncementRequest = z.infer<typeof patchAnnouncementSchema>;
export type ListMyAnnouncementsQuery = z.infer<typeof listMyAnnouncementsQuerySchema>;
export type ListProjectAnnouncementsQuery = z.infer<typeof listProjectAnnouncementsQuerySchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type AnnouncementResponse = z.infer<typeof announcementResponseSchema>;
export type AnnouncementFeedItem = z.infer<typeof announcementFeedItemSchema>;
