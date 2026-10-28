import type { Request, Response } from "express";
import type {
    CreateAnnouncementRequest,
    ListAnnouncementsQuery,
    ListMyAnnouncementsQuery,
    ListProjectAnnouncementsQuery,
    PatchAnnouncementRequest,
} from "../dtos/announcement/announcement-dto.js";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { Announcement } from "../entities/Announcement.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getInvolvedProjectIdsByUserId, getInvolvedUserIdsByProjectId } from "../repositories/allocation-repo.js";
import { getReadAnnouncementIds, markAnnouncementRead } from "../repositories/announcement-read-repo.js";
import {
    type AnnouncementFilter,
    announcementRepo,
    createAnnouncement as saveAnnouncement,
    deleteAnnouncement,
    getAnnouncementById,
    getAnnouncementFeed,
    getAnnouncements,
    updateAnnouncement,
} from "../repositories/announcement-repo.js";
import { getCompanyById } from "../repositories/company-repo.js";
import { getProjectById, getProjectsByManagerId } from "../repositories/project-repo.js";
import { toAnnouncementFeedItem, toAnnouncementResponse } from "../services/announcement-mapper.js";
import {
    canManageAnnouncement,
    isAnnouncementActive,
    requireManageableAnnouncement,
    requireReadableAnnouncement,
} from "../services/announcement-policy.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import { realtime } from "../services/realtime.js";
import { AnnouncementScope, UserRole } from "../types/enums.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Aviso não encontrado";
const PROJECT_NOT_FOUND = "Projeto não encontrado";
const EVENT = "announcement";

/** O projeto de um aviso de projeto: é o managerId dele que decide se um employee o gere. */
const projectOf = async (announcement: Announcement | null): Promise<Project | null> =>
    announcement?.projectId ? await getProjectById(announcement.projectId) : null;

/** Contra o que fica gravado: o CHECK da base de dados sairia como 500. */
function requireValidWindow(startsAt: Date, endsAt: Date | null): void {
    if (endsAt && endsAt <= startsAt) {
        throw invalidData([{ field: "endsAt", message: "O fim tem de ser depois do início" }]);
    }
}

/**
 * Manda o aviso a quem o vê no feed: toda a gente, a empresa, ou quem está no
 * projeto (e o gestor). Um agendado não vai quando começa, porque não há
 * scheduler: aparece da próxima vez que o feed for lido.
 */
async function push(announcement: Announcement, project: Project | null, payload: unknown): Promise<void> {
    switch (announcement.scope) {
        case AnnouncementScope.System:
            realtime.broadcast(EVENT, payload);
            return;
        case AnnouncementScope.Company:
            if (announcement.companyId) {
                realtime.sendToCompany(announcement.companyId, EVENT, payload);
            }
            return;
        case AnnouncementScope.Project:
            if (announcement.projectId) {
                const involved = await getInvolvedUserIdsByProjectId(announcement.projectId);
                realtime.sendToUsers([...involved, project?.managerId], EVENT, payload);
            }
            return;
    }
}

export const createAnnouncement = async (req: Request, res: Response) => {
    const body = req.body as CreateAnnouncementRequest;
    const actor: User = getCurrentActor(req);

    let companyId: string | null = null;
    let project: Project | null = null;

    if (body.scope === AnnouncementScope.System) {
        if (actor.role !== UserRole.SystemAdmin) {
            throw new HttpError(403, "Só o administrador do sistema publica avisos para toda a plataforma");
        }
    } else if (body.scope === AnnouncementScope.Company) {
        if (actor.role === UserRole.Employee) {
            throw new HttpError(403, "Sem permissões para publicar avisos na empresa");
        }

        companyId = resolveCompanyScope(actor, body.companyId, "Só pode publicar avisos na sua empresa");

        if (!(await getCompanyById(companyId))) {
            throw new HttpError(404, "Empresa não encontrada");
        }
    } else {
        project = requireInReach(actor, await getProjectById(body.projectId), PROJECT_NOT_FOUND);
        companyId = project.companyId;

        if (!canManageAnnouncement(actor, { scope: body.scope, companyId }, project)) {
            throw new HttpError(403, "Só o gestor do projeto ou um administrador publica avisos neste projeto");
        }
    }

    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;

    requireValidWindow(startsAt, endsAt);

    const created = await saveAnnouncement(
        announcementRepo.create({
            scope: body.scope,
            companyId,
            projectId: project ? project.id : null,
            createdBy: actor.id,
            title: body.title,
            body: body.body,
            severity: body.severity,
            pinned: body.pinned,
            startsAt,
            endsAt,
        }),
    );

    const data = toAnnouncementResponse(created);

    if (data.active) {
        await push(created, project, { action: "created", announcement: data });
    }

    return new HttpResponse(201, "Aviso publicado", undefined, data).send(res);
}

/** O que cada um gere, cruzado com os filtros do pedido. */
async function manageableFilter(actor: User, query: ListAnnouncementsQuery): Promise<AnnouncementFilter> {
    const projectIds = query.projectId ? [query.projectId] : undefined;
    const only = (allowed: AnnouncementScope[]) =>
        query.scope ? allowed.filter((scope) => scope === query.scope) : allowed;

    if (actor.role === UserRole.SystemAdmin) {
        return {
            ...(query.scope ? { scopes: [query.scope] } : {}),
            ...(query.companyId ? { companyId: query.companyId } : {}),
            ...(projectIds ? { projectIds } : {}),
        };
    }

    if (query.companyId && query.companyId !== actor.companyId) {
        throw new HttpError(403, "Só pode ver a sua empresa");
    }

    if (actor.role === UserRole.CompanyAdmin) {
        return {
            scopes: only([AnnouncementScope.Company, AnnouncementScope.Project]),
            companyId: actor.companyId,
            ...(projectIds ? { projectIds } : {}),
        };
    }

    // Um employee só gere os avisos dos projetos de que é gestor.
    const managed = (await getProjectsByManagerId(actor.id)).map((project) => project.id);

    return {
        scopes: only([AnnouncementScope.Project]),
        projectIds: projectIds ? managed.filter((id) => projectIds.includes(id)) : managed,
    };
}

export const listAnnouncements = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListAnnouncementsQuery;
    const now = new Date();

    const filter = await manageableFilter(actor, query);

    if (!query.includeInactive) {
        filter.activeAt = now;
    }

    const announcements = await getAnnouncements(filter);

    return new HttpResponse(
        200,
        "Avisos",
        undefined,
        announcements.map((announcement) => toAnnouncementResponse(announcement, now)),
    ).send(res);
}

/** O feed de uma pessoa: o de sistema, o da empresa, e o dos projetos em que está ou que gere. */
export const listMyAnnouncements = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListMyAnnouncementsQuery;
    const now = new Date();

    const involved = await getInvolvedProjectIdsByUserId(actor.id);
    const managed = (await getProjectsByManagerId(actor.id)).map((project) => project.id);

    const announcements = await getAnnouncementFeed({
        companyId: actor.companyId,
        projectIds: [...new Set([...involved, ...managed])],
        now,
    });

    const read = await getReadAnnouncementIds(actor.id, announcements.map((announcement) => announcement.id));

    const items = announcements
        .map((announcement) => toAnnouncementFeedItem(announcement, read.has(announcement.id), now))
        .filter((item) => !query.unread || !item.read);

    return new HttpResponse(200, "Avisos", undefined, items).send(res);
}

/** A página do projeto: quem vê o projeto vê os avisos dele, como nas alocações. */
export const listProjectAnnouncements = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, PROJECT_NOT_FOUND);
    const query = req.validQuery as ListProjectAnnouncementsQuery;
    const now = new Date();

    const project = requireInReach(actor, await getProjectById(id), PROJECT_NOT_FOUND);

    // Os agendados e os que já acabaram são só para quem os gere.
    const includeInactive = query.includeInactive
        && canManageAnnouncement(actor, { scope: AnnouncementScope.Project, companyId: project.companyId }, project);

    const announcements = await getAnnouncements({
        scopes: [AnnouncementScope.Project],
        projectIds: [project.id],
        ...(includeInactive ? {} : { activeAt: now }),
    });

    const read = await getReadAnnouncementIds(actor.id, announcements.map((announcement) => announcement.id));

    return new HttpResponse(
        200,
        "Avisos do projeto",
        undefined,
        announcements.map((announcement) => toAnnouncementFeedItem(announcement, read.has(announcement.id), now)),
    ).send(res);
}

export const getAnnouncement = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const found = await getAnnouncementById(id);
    const announcement = requireReadableAnnouncement(actor, found, await projectOf(found), NOT_FOUND);

    const read = await getReadAnnouncementIds(actor.id, [announcement.id]);

    return new HttpResponse(200, "Aviso", undefined, toAnnouncementFeedItem(announcement, read.has(announcement.id))).send(res);
}

export const patchAnnouncement = async (req: Request, res: Response) => {
    const body = req.body as PatchAnnouncementRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const found = await getAnnouncementById(id);
    const project = await projectOf(found);
    const announcement = requireManageableAnnouncement(actor, found, project, NOT_FOUND);

    const wasActive = isAnnouncementActive(announcement);

    const startsAt = body.startsAt === undefined ? announcement.startsAt : new Date(body.startsAt);
    const endsAt = body.endsAt === undefined
        ? announcement.endsAt
        : body.endsAt === null ? null : new Date(body.endsAt);

    // O Zod só vê o patch, por isso a janela compara-se aqui com o que está gravado.
    requireValidWindow(startsAt, endsAt);

    if (body.title !== undefined) {
        announcement.title = body.title;
    }

    if (body.body !== undefined) {
        announcement.body = body.body;
    }

    if (body.severity !== undefined) {
        announcement.severity = body.severity;
    }

    if (body.pinned !== undefined) {
        announcement.pinned = body.pinned;
    }

    announcement.startsAt = startsAt;
    announcement.endsAt = endsAt;

    const saved = await updateAnnouncement(announcement);
    const data = toAnnouncementResponse(saved);

    // Também quando deixa de estar ativo: o cliente tira-o com o `active` a false.
    if (wasActive || data.active) {
        await push(saved, project, { action: "updated", announcement: data });
    }

    return new HttpResponse(200, "Aviso atualizado", undefined, data).send(res);
}

export const removeAnnouncement = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const found = await getAnnouncementById(id);
    const project = await projectOf(found);
    const announcement = requireManageableAnnouncement(actor, found, project, NOT_FOUND);

    await deleteAnnouncement(announcement.id);

    if (isAnnouncementActive(announcement)) {
        await push(announcement, project, { action: "deleted", id: announcement.id });
    }

    return new HttpResponse(200, "Aviso apagado").send(res);
}

/** Marcar como lido, ou dispensar o banner. Repetir não muda nada. */
export const readAnnouncement = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const found = await getAnnouncementById(id);
    const announcement = requireReadableAnnouncement(actor, found, await projectOf(found), NOT_FOUND);

    await markAnnouncementRead(announcement.id, actor.id);

    return new HttpResponse(200, "Aviso lido", undefined, toAnnouncementFeedItem(announcement, true)).send(res);
}
