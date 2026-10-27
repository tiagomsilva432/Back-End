import { AppDataSource } from "../data-source.js";
import { EmployeeSkill } from "../entities/EmployeeSkill.js";

export const employeeSkillRepo = AppDataSource.getRepository(EmployeeSkill);

export async function getEmployeeSkill(userId: string, skillId: string): Promise<EmployeeSkill | null> {
    return await employeeSkillRepo.findOneBy({
        userId,
        skillId
    });
}

export async function getEmployeeSkillsByUserId(userId: string): Promise<EmployeeSkill[]> {
    return await employeeSkillRepo.find({
        where: { userId },
        relations: { skill: true },
        order: { skill: { name: "ASC" } }
    });
}

/** O catálogo é partilhado, as pessoas não: filtra-se pela empresa de cada uma. */
export async function getEmployeeSkillsBySkillIdAndCompanyId(skillId: string, companyId: string): Promise<EmployeeSkill[]> {
    return await employeeSkillRepo.find({
        where: { skillId, user: { companyId } },
        order: { proficiency: { direction: "DESC", nulls: "LAST" } }
    });
}

export async function updateEmployeeSkill(employeeSkill: EmployeeSkill) {
    return await employeeSkillRepo.save(employeeSkill);
}

export async function deleteEmployeeSkill(userId: string, skillId: string) {
    return await employeeSkillRepo.delete({
        userId,
        skillId
    });
}
