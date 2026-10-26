import { Between } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { CompanyHoliday } from "../entities/CompanyHoliday.js";

export const companyHolidayRepo = AppDataSource.getRepository(CompanyHoliday);

export async function getCompanyHolidayById(id: string): Promise<CompanyHoliday | null> {
    return await companyHolidayRepo.findOneBy({
        id
    });
}

export async function getCompanyHolidayByDate(companyId: string, date: string): Promise<CompanyHoliday | null> {
    return await companyHolidayRepo.findOneBy({
        companyId,
        date
    });
}

/** Os de uma empresa entre duas datas, inclusivas, por ordem. */
export async function getCompanyHolidaysBetween(
    companyId: string,
    from: string,
    to: string,
): Promise<CompanyHoliday[]> {
    return await companyHolidayRepo.find({
        where: { companyId, date: Between(from, to) },
        order: { date: "ASC" }
    });
}

export async function createCompanyHoliday(holiday: CompanyHoliday) {
    return await companyHolidayRepo.save(holiday);
}

export async function deleteCompanyHoliday(id: string) {
    return await companyHolidayRepo.delete({
        id
    });
}
