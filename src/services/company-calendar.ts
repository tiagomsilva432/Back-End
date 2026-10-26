import type { AbsenceResponse } from "../dtos/absence/absence-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import type { AbsenceRequest } from "../entities/AbsenceRequest.js";
import type { Company } from "../entities/Company.js";
import { getCompanyById } from "../repositories/company-repo.js";
import { getCompanyHolidaysBetween } from "../repositories/company-holiday-repo.js";
import { toAbsenceResponse } from "./absence-mapper.js";
import { countWorkingDays, type Holiday, holidaysBetween } from "./holidays.js";

type CompanyRef = Pick<Company, "id" | "country">;

export async function requireCompany(companyId: string): Promise<Company> {
    const company = await getCompanyById(companyId);

    if (!company) {
        throw new HttpError(404, "Empresa não encontrada");
    }

    return company;
}

/** Os feriados de uma empresa num intervalo: os nacionais do país dela e os que ela juntou. */
export async function getHolidaysOf(company: CompanyRef, from: string, to: string): Promise<Holiday[]> {
    return holidaysBetween(company.country, await getCompanyHolidaysBetween(company.id, from, to), from, to);
}

export const holidayDates = (holidays: Holiday[]): Set<string> => new Set(holidays.map((holiday) => holiday.date));

/**
 * Os pedidos com os dias úteis de cada um, contados contra os feriados da
 * empresa de cada pedido. Os feriados leem-se uma vez por empresa, para o
 * intervalo que cobre todos os pedidos dela.
 */
export async function withWorkingDays(absences: AbsenceRequest[]): Promise<AbsenceResponse[]> {
    const ranges = new Map<string, { from: string; to: string }>();

    for (const absence of absences) {
        const range = ranges.get(absence.companyId);

        ranges.set(absence.companyId, {
            from: range && range.from < absence.startDate ? range.from : absence.startDate,
            to: range && range.to > absence.endDate ? range.to : absence.endDate,
        });
    }

    const dates = new Map<string, Set<string>>();

    for (const [companyId, { from, to }] of ranges) {
        dates.set(companyId, holidayDates(await getHolidaysOf(await requireCompany(companyId), from, to)));
    }

    return absences.map((absence) => toAbsenceResponse(
        absence,
        countWorkingDays(absence.startDate, absence.endDate, dates.get(absence.companyId) ?? new Set()),
    ));
}
