import { In, IsNull, LessThanOrEqual, MoreThan } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Salary } from "../entities/Salary.js";

export const salaryRepo = AppDataSource.getRepository(Salary);

export async function getSalaryHistoryByUserId(userId: string): Promise<Salary[]> {
    return await salaryRepo.find({
        where: { userId },
        order: { effectiveFrom: "DESC" }
    });
}

/** O salário que se paga nesta data. O effectiveTo é exclusivo: é o dia em que o seguinte começa. */
export async function getSalaryInForce(userId: string, date: string): Promise<Salary | null> {
    return await salaryRepo.findOne({
        where: [
            { userId, effectiveFrom: LessThanOrEqual(date), effectiveTo: IsNull() },
            { userId, effectiveFrom: LessThanOrEqual(date), effectiveTo: MoreThan(date) },
        ],
        order: { effectiveFrom: "DESC" }
    });
}

/**
 * Os salários de toda a gente de uma empresa, de sempre. Também os de quem já
 * saiu, mesmo com a conta apagada: foram pagos, e contam no que se gastou.
 */
export async function getSalariesByCompanyId(companyId: string): Promise<Salary[]> {
    return await salaryRepo
        .createQueryBuilder("s")
        // Antes do join: o TypeORM só deixa de filtrar os apagados nos joins feitos depois.
        .withDeleted()
        .innerJoin("s.user", "u")
        .where("u.companyId = :companyId", { companyId })
        .getMany();
}

export async function getSalariesByUserIds(userIds: string[]): Promise<Salary[]> {
    if (userIds.length === 0) {
        return [];
    }

    return await salaryRepo.find({
        where: { userId: In(userIds) }
    });
}

export async function createSalary(salary: Salary) {
    return await salaryRepo.save(salary);
}

/**
 * Fecha o salário aberto e grava o seguinte numa só transação: o índice único só
 * deixa haver uma linha aberta, e a meio caminho a pessoa ficava sem nenhuma.
 * Nos testes, o manager é o da transação do teste e isto vira um savepoint.
 */
export async function replaceOpenSalary(open: Salary | null, next: Salary): Promise<Salary> {
    return await salaryRepo.manager.transaction(async (manager) => {
        if (open) {
            await manager.save(open);
        }
        return await manager.save(next);
    });
}

/** Desfaz o salário mais recente e reabre o anterior, se foi ele que o fechou. */
export async function removeLatestSalary(latest: Salary, previous: Salary | null): Promise<void> {
    await salaryRepo.manager.transaction(async (manager) => {
        await manager.delete(Salary, { id: latest.id });
        if (previous) {
            await manager.save(previous);
        }
    });
}
