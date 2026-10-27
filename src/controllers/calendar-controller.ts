import type { Request, Response } from "express";
import type {
    CalendarQuery,
    CreateHolidayRequest,
    ListHolidaysQuery,
    ProjectCalendarQuery,
} from "../dtos/calendar/calendar-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type { Company } from "../entities/Company.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getCalendarAbsences } from "../repositories/absence-repo.js";
import { getUserIdsAllocatedBetween } from "../repositories/allocation-repo.js";
import {
    companyHolidayRepo,
    createCompanyHoliday,
    deleteCompanyHoliday,
    getCompanyHolidayByDate,
    getCompanyHolidayById,
} from "../repositories/company-holiday-repo.js";
import { getProjectById } from "../repositories/project-repo.js";
import { toCalendarAbsence, toCompanyHolidayResponse } from "../services/absence-mapper.js";
import { isAbsenceAdminOf } from "../services/absence-policy.js";
import { getHolidaysOf, requireCompany } from "../services/company-calendar.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import { isNationalHoliday } from "../services/holidays.js";
import { uuidParam } from "../utils/params.js";

const OUTSIDE_COMPANY = "Só pode ver a sua empresa";
const PROJECT_NOT_FOUND = "Projeto não encontrado";
const HOLIDAY_NOT_FOUND = "Feriado não encontrado";

/**
 * Os feriados e as ausências de uma empresa num intervalo, como quem pergunta
 * os pode ver. `userIds` restringe as ausências às pessoas de um projeto.
 */
async function buildCalendar(actor: User, company: Company, from: string, to: string, userIds?: string[]) {
    const holidays = await getHolidaysOf(company, from, to);
    const absences = await getCalendarAbsences({
        companyId: company.id,
        from,
        to,
        ...(userIds ? { userIds } : {}),
        viewerId: actor.id,
        allPending: isAbsenceAdminOf(actor, company.id),
    });

    return {
        companyId: company.id,
        from,
        to,
        holidays,
        absences: absences.map((absence) => toCalendarAbsence(absence, actor)),
    };
}

export const getCalendar = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as CalendarQuery;

    const company = await requireCompany(resolveCompanyScope(actor, query.companyId, OUTSIDE_COMPANY));

    return new HttpResponse(
        200,
        "Calendário",
        undefined,
        await buildCalendar(actor, company, query.from, query.to),
    ).send(res);
}

/** Quem esteve alocado ao projeto em algum dia do intervalo, e o gestor. */
export const getProjectCalendar = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, PROJECT_NOT_FOUND);
    const query = req.validQuery as ProjectCalendarQuery;

    const project = requireInReach(actor, await getProjectById(id), PROJECT_NOT_FOUND);
    const company = await requireCompany(project.companyId);

    const allocated = await getUserIdsAllocatedBetween(project.id, query.from, query.to);
    const userIds = [...new Set([...allocated, ...(project.managerId ? [project.managerId] : [])])];

    const calendar = await buildCalendar(actor, company, query.from, query.to, userIds);

    return new HttpResponse(200, "Calendário do projeto", undefined, { ...calendar, projectId: project.id }).send(res);
}

export const listHolidays = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as ListHolidaysQuery;

    const company = await requireCompany(resolveCompanyScope(actor, query.companyId, OUTSIDE_COMPANY));
    const holidays = await getHolidaysOf(company, `${query.year}-01-01`, `${query.year}-12-31`);

    return new HttpResponse(200, "Feriados", undefined, holidays).send(res);
}

export const createHoliday = async (req: Request, res: Response) => {
    const body = req.body as CreateHolidayRequest;
    const actor: User = getCurrentActor(req);

    const companyId = resolveCompanyScope(actor, body.companyId, "Só pode gerir os feriados da sua empresa");
    const company = await requireCompany(companyId);

    if (isNationalHoliday(company.country, body.date)) {
        throw new HttpError(409, "Esse dia já é feriado nacional");
    }

    if (await getCompanyHolidayByDate(companyId, body.date)) {
        throw new HttpError(409, "A empresa já tem um feriado nesse dia");
    }

    const created = await createCompanyHoliday(
        companyHolidayRepo.create({
            companyId,
            date: body.date,
            name: body.name,
            createdBy: actor.id,
        }),
    );

    return new HttpResponse(201, "Feriado criado", undefined, toCompanyHolidayResponse(created)).send(res);
}

/** Só os da empresa: os nacionais não estão gravados, e não há id para os apagar. */
export const removeHoliday = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, HOLIDAY_NOT_FOUND);

    const holiday = requireInReach(actor, await getCompanyHolidayById(id), HOLIDAY_NOT_FOUND);

    await deleteCompanyHoliday(holiday.id);

    return new HttpResponse(200, "Feriado apagado").send(res);
}
