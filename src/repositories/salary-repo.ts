import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Salary } from "../entities/Salary.js";

export const salaryRepo = AppDataSource.getRepository(Salary);

export async function getSalaryById(id: string): Promise<Salary | null> {
    return await salaryRepo.findOneBy({
        id
    });
}

/** The open row (no effectiveTo) is the one in force; the unique index guarantees at most one. */
export async function getCurrentSalaryByUserId(userId: string): Promise<Salary | null> {
    return await salaryRepo.findOneBy({
        userId,
        effectiveTo: IsNull()
    });
}

export async function getSalaryHistoryByUserId(userId: string): Promise<Salary[]> {
    return await salaryRepo.find({
        where: { userId },
        order: { effectiveFrom: "DESC" }
    });
}

export async function createSalary(salary: Salary) {
    return await salaryRepo.save(salary);
}

export async function updateSalary(salary: Salary) {
    return await salaryRepo.save(salary);
}
