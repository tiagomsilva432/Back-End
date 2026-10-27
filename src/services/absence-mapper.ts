import type { AbsenceResponse } from "../dtos/absence/absence-dto.js";
import type { CalendarAbsence, CompanyHolidayResponse } from "../dtos/calendar/calendar-dto.js";
import type { AbsenceRequest } from "../entities/AbsenceRequest.js";
import type { FileResponse } from "../dtos/file/file-dto.js";
import type { CompanyHoliday } from "../entities/CompanyHoliday.js";
import type { User } from "../entities/User.js";
import { AbsenceStatus } from "../types/enums.js";
import { canSeeAbsenceDetails, publicAbsenceType } from "./absence-policy.js";

export const toAbsenceResponse = (
    absence: AbsenceRequest,
    workingDays: number,
    documents: FileResponse[],
): AbsenceResponse => ({
    id: absence.id,
    companyId: absence.companyId,
    userId: absence.userId,
    type: absence.type,
    status: absence.status,
    startDate: absence.startDate,
    endDate: absence.endDate,
    workingDays,
    note: absence.note,
    decidedBy: absence.decidedBy,
    decidedAt: absence.decidedAt ? absence.decidedAt.toISOString() : null,
    decisionNote: absence.decisionNote,
    documents,
    createdAt: absence.createdAt.toISOString(),
    updatedAt: absence.updatedAt.toISOString(),
});

/** Como quem pergunta a vê: sem a nota, e com o tipo tapado se não for a pessoa nem um admin. */
export const toCalendarAbsence = (
    absence: AbsenceRequest,
    viewer: Pick<User, "id" | "role" | "companyId">,
): CalendarAbsence => ({
    id: absence.id,
    userId: absence.userId,
    type: canSeeAbsenceDetails(viewer, absence) ? absence.type : publicAbsenceType(absence.type),
    // O repositório só devolve estes dois ao calendário.
    status: absence.status === AbsenceStatus.Pending ? AbsenceStatus.Pending : AbsenceStatus.Approved,
    startDate: absence.startDate,
    endDate: absence.endDate,
});

export const toCompanyHolidayResponse = (holiday: CompanyHoliday): CompanyHolidayResponse => ({
    id: holiday.id,
    companyId: holiday.companyId,
    date: holiday.date,
    name: holiday.name,
    createdBy: holiday.createdBy,
    createdAt: holiday.createdAt.toISOString(),
});
