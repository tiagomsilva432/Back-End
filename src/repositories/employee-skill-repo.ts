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

export async function getEmployeeSkillsBySkillId(skillId: string): Promise<EmployeeSkill[]> {
    return await employeeSkillRepo.find({
        where: { skillId },
        order: { proficiency: "DESC" }
    });
}

export async function createEmployeeSkill(employeeSkill: EmployeeSkill) {
    return await employeeSkillRepo.save(employeeSkill);
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
