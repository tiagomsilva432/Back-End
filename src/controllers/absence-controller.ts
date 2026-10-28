import type { Request, Response } from "express";
import type {
    AbsenceDecisionRequest,
    AbsenceSummaryQuery,
    AbsenceSummaryResponse,
    CreateAbsenceRequest,
    ListAbsencesQuery,
    ListMyAbsencesQuery,
    RegisterAbsenceRequest,
} from "../dtos/absence/absence-dto.js";
import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { AbsenceRequest } from "../entities/AbsenceRequest.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    absenceRepo,
    createAbsenceIfFree,
    getAbsenceById,
    getAbsences,
    getApprovedAbsencesBetween,
    updateAbsence,
} from "../repositories/absence-repo.js";
import { getManagerIdsOfProjectsAllocatedBetween } from "../repositories/allocation-repo.js";
import { getUserById } from "../repositories/user-repo.js";
import { toAbsenceResponse } from "../services/absence-mapper.js";
import {
    canDecideAbsence,
    canSeeAbsenceDetails,
    publicAbsenceType,
    requireAttachableAbsence,
    requireDecidableAbsence,
    requireReadableAbsence,
} from "../services/absence-policy.js";
import { companyAdminIdsOrSystemAdmins } from "../services/admin-recipients.js";
import { getHolidaysOf, holidayDates, requireCompany, withWorkingDays } from "../services/company-calendar.js";
import { fileHandlers } from "../services/files/file-handlers.js";
import { FILE_KINDS } from "../services/files/file-kinds.js";
import { countWorkingDays } from "../services/holidays.js";
import { notifier } from "../services/notifier.js";
import { requireUserInReach } from "../services/user-scope.js";
import { AbsenceStatus, AbsenceType, FileKind, UserRole, UserStatus } from "../types/enums.js";
import { isoDate } from "../utils/dates.js";
import { uuidParam } from "../utils/params.js";

const NOT_FOUND = "Pedido não encontrado";
const USER_NOT_FOUND = "Utilizador não encontrado";

/** O que as notificações levam: ids e datas, nunca a nota. */
const notificationData = (absence: AbsenceRequest) => ({
    absenceId: absence.id,
    userId: absence.userId,
    type: absence.type,
    startDate: absence.startDate,
    endDate: absence.endDate,
});

/**
 * Quem decide os pedidos desta pessoa: os outros company_admins ativos da
 * empresa, ou os system_admins quando não há nenhum.
 */
const deciderIds = (absence: Pick<AbsenceRequest, "userId" | "companyId">): Promise<string[]> =>
    companyAdminIdsOrSystemAdmins(absence.companyId, absence.userId);

/**
 * Os gestores dos projetos da pessoa nesses dias sabem que ela vai faltar,
 * mas como colegas: uma baixa chega-lhes como "ausente". Uma ausência que já
 * acabou não é aviso para ninguém.
 */
const notifyTeammatesAway = async (absence: AbsenceRequest, actorId: string): Promise<void> => {
    if (absence.endDate < isoDate()) {
        return;
    }

    await notifier.notify("absence.teammate_away", {
        companyId: absence.companyId,
        recipientIds: await getManagerIdsOfProjectsAllocatedBetween(absence.userId, absence.startDate, absence.endDate),
        exclude: [actorId, absence.userId],
        data: { ...notificationData(absence), type: publicAbsenceType(absence.type) },
    });
};

const requirePending = (absence: AbsenceRequest): void => {
    if (absence.status !== AbsenceStatus.Pending) {
        throw new HttpError(409, "Este pedido já não está pendente");
    }
};

const decide = (absence: AbsenceRequest, actor: User, status: AbsenceStatus, note: string | null): void => {
    absence.status = status;
    absence.decidedBy = actor.id;
    absence.decidedAt = new Date();
    absence.decisionNote = note;
};

/** Os dias úteis do intervalo: 400 se só tem fins de semana e feriados. */
async function requireWorkingDays(
    person: Pick<User, "companyId">,
    range: { startDate: string; endDate: string },
): Promise<number> {
    const company = await requireCompany(person.companyId);
    const holidays = await getHolidaysOf(company, range.startDate, range.endDate);
    const workingDays = countWorkingDays(range.startDate, range.endDate, holidayDates(holidays));

    if (workingDays === 0) {
        throw invalidData([{ field: "endDate", message: "O intervalo só tem fins de semana e feriados" }]);
    }

    return workingDays;
}

/** 409 se toca noutro pedido pendente ou aprovado da mesma pessoa. */
async function createIfFree(absence: AbsenceRequest, overlapMessage: string): Promise<AbsenceRequest> {
    const created = await createAbsenceIfFree(absence);

    if (!created) {
        throw new HttpError(409, overlapMessage);
    }

    return created;
}

export const createAbsence = async (req: Request, res: Response) => {
    const body = req.body as CreateAbsenceRequest;
    const actor: User = getCurrentActor(req);

    const workingDays = await requireWorkingDays(actor, body);

    // Uma baixa não passa por aprovação. Sem decidedBy: ninguém a aprovou,
    // e muito menos a própria pessoa.
    const autoApproved = body.type === AbsenceType.Sick;

    const created = await createIfFree(
        absenceRepo.create({
            companyId: actor.companyId,
            userId: actor.id,
            type: body.type,
            status: autoApproved ? AbsenceStatus.Approved : AbsenceStatus.Pending,
            startDate: body.startDate,
            endDate: body.endDate,
            note: body.note ?? null,
            decidedBy: null,
            decidedAt: autoApproved ? new Date() : null,
            decisionNote: null,
        }),
        "Já tem um pedido pendente ou aprovado nesses dias",
    );

    await notifier.notify(autoApproved ? "absence.auto_approved" : "absence.requested", {
        companyId: created.companyId,
        recipientIds: await deciderIds(created),
        exclude: [actor.id],
        data: notificationData(created),
    });

    if (autoApproved) {
        await notifyTeammatesAway(created, actor.id);
    }

    return new HttpResponse(201, "Pedido criado", undefined, toAbsenceResponse(created, workingDays, [])).send(res);
}

/** Um admin regista a ausência de outra pessoa, já aprovada: uma falta, ou a baixa de quem ligou a avisar. */
export const registerAbsence = async (req: Request, res: Response) => {
    const body = req.body as RegisterAbsenceRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);

    const target = requireUserInReach(actor, await getUserById(id), USER_NOT_FOUND);

    if (!canDecideAbsence(actor, { userId: target.id, companyId: target.companyId })) {
        throw new HttpError(403, "Para pedir uma ausência sua, use a página das suas ausências");
    }

    if (target.status === UserStatus.Terminated) {
        throw new HttpError(409, "Esta conta está terminada");
    }

    const workingDays = await requireWorkingDays(target, body);

    const created = await createIfFree(
        absenceRepo.create({
            companyId: target.companyId,
            userId: target.id,
            type: body.type,
            status: AbsenceStatus.Approved,
            startDate: body.startDate,
            endDate: body.endDate,
            note: body.note ?? null,
            decidedBy: actor.id,
            decidedAt: new Date(),
            decisionNote: null,
        }),
        "Esta pessoa já tem um pedido pendente ou aprovado nesses dias",
    );

    await notifier.notify("absence.registered", {
        companyId: created.companyId,
        recipientIds: [created.userId],
        exclude: [actor.id],
        data: notificationData(created),
    });

    await notifyTeammatesAway(created, actor.id);

    return new HttpResponse(201, "Ausência registada", undefined, toAbsenceResponse(created, workingDays, [])).send(res);
}

export const listMyAbsences = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListMyAbsencesQuery;

    const absences = await getAbsences({
        userId: actor.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
    });

    return new HttpResponse(200, "Pedidos", undefined, await withWorkingDays(absences)).send(res);
}

/** Para quem aprova: os da sua empresa. Um system_admin vê todas, ou a que indicar. */
export const listAbsences = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListAbsencesQuery;

    if (actor.role !== UserRole.SystemAdmin && query.companyId && query.companyId !== actor.companyId) {
        throw new HttpError(403, "Só pode ver a sua empresa");
    }

    const companyId = actor.role === UserRole.SystemAdmin ? query.companyId : actor.companyId;

    const absences = await getAbsences({
        ...(companyId ? { companyId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
    });

    return new HttpResponse(200, "Pedidos", undefined, await withWorkingDays(absences)).send(res);
}

export const getAbsence = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const absence = requireReadableAbsence(actor, await getAbsenceById(id), NOT_FOUND);
    const [data] = await withWorkingDays([absence]);

    return new HttpResponse(200, "Pedido", undefined, data).send(res);
}

export const approveAbsence = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const absence = requireDecidableAbsence(actor, await getAbsenceById(id), NOT_FOUND);
    requirePending(absence);

    decide(absence, actor, AbsenceStatus.Approved, null);
    const saved = await updateAbsence(absence);

    await notifier.notify("absence.approved", {
        companyId: saved.companyId,
        recipientIds: [saved.userId],
        exclude: [actor.id],
        data: notificationData(saved),
    });

    await notifyTeammatesAway(saved, actor.id);

    const [data] = await withWorkingDays([saved]);

    return new HttpResponse(200, "Pedido aprovado", undefined, data).send(res);
}

export const rejectAbsence = async (req: Request, res: Response) => {
    const body = req.body as AbsenceDecisionRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const absence = requireDecidableAbsence(actor, await getAbsenceById(id), NOT_FOUND);
    requirePending(absence);

    decide(absence, actor, AbsenceStatus.Rejected, body?.reason ?? null);
    const saved = await updateAbsence(absence);

    await notifier.notify("absence.rejected", {
        companyId: saved.companyId,
        recipientIds: [saved.userId],
        exclude: [actor.id],
        data: { ...notificationData(saved), reason: saved.decisionNote },
    });

    const [data] = await withWorkingDays([saved]);

    return new HttpResponse(200, "Pedido recusado", undefined, data).send(res);
}

/**
 * A pessoa cancela o que está pendente, ou aprovado e ainda por começar. Quem
 * decide cancela o que está pendente ou aprovado, a qualquer altura: alguém que
 * voltou mais cedo, ou um engano.
 */
export const cancelAbsence = async (req: Request, res: Response) => {
    const body = req.body as AbsenceDecisionRequest;
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, NOT_FOUND);

    const absence = requireReadableAbsence(actor, await getAbsenceById(id), NOT_FOUND);

    if (absence.status !== AbsenceStatus.Pending && absence.status !== AbsenceStatus.Approved) {
        throw new HttpError(409, "Este pedido já não está ativo");
    }

    const byDecider = canDecideAbsence(actor, absence);

    if (!byDecider && absence.status === AbsenceStatus.Approved && absence.startDate <= isoDate()) {
        throw new HttpError(409, "Esta ausência já começou: só um administrador a pode cancelar");
    }

    decide(absence, actor, AbsenceStatus.Cancelled, body?.reason ?? null);
    const saved = await updateAbsence(absence);

    // Vai para o outro lado: a pessoa, se foi um admin; quem decide, se foi ela.
    await notifier.notify("absence.cancelled", {
        companyId: saved.companyId,
        recipientIds: byDecider ? [saved.userId] : await deciderIds(saved),
        exclude: [actor.id],
        data: { ...notificationData(saved), reason: saved.decisionNote },
    });

    const [data] = await withWorkingDays([saved]);

    return new HttpResponse(200, "Pedido cancelado", undefined, data).send(res);
}

/**
 * As justificações de um pedido: um atestado, uma declaração. Juntam-nas a
 * pessoa ou quem decide, enquanto o pedido está ativo. Como a nota, ninguém
 * mais as vê: para os outros, o pedido é 404.
 */
const documents = fileHandlers(FILE_KINDS[FileKind.AbsenceDocument], {
    requireOwner: async (actor, req) => {
        const absence = requireAttachableAbsence(
            actor,
            await getAbsenceById(uuidParam(req.params.id, NOT_FOUND)),
            NOT_FOUND,
        );

        return { companyId: absence.companyId, ownerId: absence.id, owner: absence };
    },
    // Um pedido por decidir que ganha uma justificação volta a merecer um olhar.
    // Se foi um admin a juntá-la, já é um de quem decide: não há a quem avisar.
    afterUpload: async (actor, absence) => {
        if (absence.status !== AbsenceStatus.Pending || actor.id !== absence.userId) {
            return;
        }

        await notifier.notify("absence.document_added", {
            companyId: absence.companyId,
            recipientIds: await deciderIds(absence),
            exclude: [actor.id],
            data: notificationData(absence),
        });
    },
    messages: { uploaded: "Documento anexado", removed: "Documento apagado", notFound: "Documento não encontrado" },
});

export const uploadAbsenceDocument = documents.upload;
export const removeAbsenceDocument = documents.remove;

/** Os dias úteis de ausências aprovadas num ano. Os pedidos que passam a passagem de ano contam só a parte de dentro. */
export const getAbsenceSummary = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, USER_NOT_FOUND);
    const query = req.validQuery as AbsenceSummaryQuery;

    const target = requireUserInReach(actor, await getUserById(id), USER_NOT_FOUND);

    if (!canSeeAbsenceDetails(actor, { userId: target.id, companyId: target.companyId })) {
        throw new HttpError(403, "Sem permissões para ver as ausências desta pessoa");
    }

    const from = `${query.year}-01-01`;
    const to = `${query.year}-12-31`;
    const holidays = holidayDates(await getHolidaysOf(await requireCompany(target.companyId), from, to));

    const summary: AbsenceSummaryResponse = {
        userId: target.id,
        year: query.year,
        [AbsenceType.Vacation]: 0,
        [AbsenceType.Sick]: 0,
        [AbsenceType.Leave]: 0,
        [AbsenceType.Unjustified]: 0,
    };

    for (const absence of await getApprovedAbsencesBetween(target.id, from, to)) {
        summary[absence.type] += countWorkingDays(
            absence.startDate < from ? from : absence.startDate,
            absence.endDate > to ? to : absence.endDate,
            holidays,
        );
    }

    return new HttpResponse(200, "Resumo das ausências", undefined, summary).send(res);
}
