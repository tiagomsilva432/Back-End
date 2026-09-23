import { AppDataSource } from "../data-source.js";
import { Company } from "../entities/Company.js";

export const companyRepo = AppDataSource.getRepository(Company);

export async function getCompanyById(id: string): Promise<Company | null> {
    return await companyRepo.findOneBy({
        id
    });
}

export async function getCompanyByTaxId(taxId: string): Promise<Company | null> {
    return await companyRepo.findOneBy({
        taxId
    });
}

export async function getCompanies(): Promise<Company[]> {
    return await companyRepo.find({
        order: { name: "ASC" }
    });
}

export async function createCompany(company: Company) {
    return await companyRepo.save(company);
}

export async function updateCompany(company: Company) {
    return await companyRepo.save(company);
}
