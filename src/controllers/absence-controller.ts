import type { Request, Response } from "express";
import type {
    AbsenceDecisionRequest,
    AbsenceSummaryQuery,
    AbsenceSummaryResponse,
    CreateAbsenceRequest,
    ListAbsencesQuery,
    ListMyAbsencesQuery,
} from "../dtos/absence/absence-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { AbsenceRequest } from "../entities/AbsenceRequest.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import {
    absenceRepo,
    createAbsence as saveAbsence,
    getAbsenceById,
    getAbsences,
    getApprovedAbsencesBetween,
    getOverlappingActiveAbsence,
    updateAbsence,
} from "../repositories/absence-repo.js";
import { getManagerIdsOfProjectsAllocatedBetween } from "../repositories/allocation-repo.js";
import { getUserById, getUsersByCompanyId } from "../repositories/user-repo.js";
import { toAbsenceResponse } from "../services/absence-mapper.js";
import {
    canDecideAbsence,
    canSeeAbsenceDetails,
    publicAbsenceType,
    requireDecidableAbsence,
    requireReadableAbsence,
} from "../services/absence-policy.js";
import { getHolidaysOf, holidayDates, requireCompany, withWorkingDays } from "../services/company-calendar.js";
import { countWorkingDays } from "../services/holidays.js";
import { notifier } from "../services/notifier.js";
import { requireUserInReach } from "../services/user-scope.js";
import { AbsenceStatus, AbsenceType, UserRole, UserStatus } from "../types/enums.js";
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

/** Os company_admins ativos da empresa: são eles que aprovam. */
const companyAdminIds = async (companyId: string): Promise<string[]> =>
    (await getUsersByCompanyId(companyId, { role: UserRole.CompanyAdmin, status: UserStatus.Active }))
        .map((admin) => admin.id);

const requirePending = (absence: AbsenceRequest): void => {
    if (absence.status !== AbsenceStatus.Pending) {
        throw new HttpError(409, `Este pedido já não está pendente: está ${absence.status}`);
    }
};

/** Quem fez a última coisa ao pedido, e quando. */
const decide = (absence: AbsenceRequest, actor: User, status: AbsenceStatus, note: string | null): void => {
    absence.status = status;
    absence.decidedBy = actor.id;
    absence.decidedAt = new Date();
    absence.decisionNote = note;
};

export const createAbsence = async (req: Request, res: Response) => {
    const body = req.body as CreateAbsenceRequest;
    const actor: User = getCurrentActor(req);

    const company = await requireCompany(actor.companyId);
    const holidays = await getHolidaysOf(company, body.startDate, body.endDate);
    const workingDays = countWorkingDays(body.startDate, body.endDate, holidayDates(holidays));

    if (workingDays === 0) {
        throw new HttpError(400, "Dados inválidos", "BAD_REQUEST", [
            { field: "endDate", message: "O intervalo só tem fins de semana e feriados" },
        ]);
    }

    if (await getOverlappingActiveAbsence(actor.id, body.startDate, body.endDate)) {
        throw new HttpError(409, "Já tens um pedido pendente ou aprovado nesses dias");
    }

    const created = await saveAbsence(
        absenceRepo.create({
            companyId: actor.companyId,
            userId: actor.id,
            type: body.type,
            startDate: body.startDate,
            endDate: body.endDate,
            note: body.note ?? null,
            decidedBy: null,
            decidedAt: null,
            decisionNote: null,
        }),
    );

    await notifier.notify("absence.requested", {
        companyId: created.companyId,
        recipientIds: await companyAdminIds(created.companyId),
        exclude: [actor.id],
        data: notificationData(created),
    });

    return new HttpResponse(201, "Pedido criado", undefined, toAbsenceResponse(created, workingDays)).send(res);
}

export const listMyAbsences = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListMyAbsencesQuery;

    const absences = await getAbsences({ userId: actor.id, ...(query.status ? { status: query.status } : {}) });

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

    // Os gestores dos projetos da pessoa nesses dias sabem que ela vai faltar,
    // mas como colegas: uma baixa chega-lhes como "ausente".
    await notifier.notify("absence.teammate_away", {
        companyId: saved.companyId,
        recipientIds: await getManagerIdsOfProjectsAllocatedBetween(saved.userId, saved.startDate, saved.endDate),
        exclude: [actor.id, saved.userId],
        data: { ...notificationData(saved), type: publicAbsenceType(saved.type) },
    });

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
        throw new HttpError(409, `Este pedido já não está ativo: está ${absence.status}`);
    }

    const byDecider = canDecideAbsence(actor, absence);

    if (!byDecider && absence.status === AbsenceStatus.Approved && absence.startDate <= isoDate()) {
        throw new HttpError(409, "Esta ausência já começou: só um admin a pode cancelar");
    }

    decide(absence, actor, AbsenceStatus.Cancelled, body?.reason ?? null);
    const saved = await updateAbsence(absence);

    // Vai para o outro lado: a pessoa, se foi um admin; os admins, se foi ela.
    await notifier.notify("absence.cancelled", {
        companyId: saved.companyId,
        recipientIds: byDecider ? [saved.userId] : await companyAdminIds(saved.companyId),
        exclude: [actor.id],
        data: { ...notificationData(saved), reason: saved.decisionNote },
    });

    const [data] = await withWorkingDays([saved]);

    return new HttpResponse(200, "Pedido cancelado", undefined, data).send(res);
}

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
