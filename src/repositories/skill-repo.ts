import { AppDataSource } from "../data-source.js";
import { Skill } from "../entities/Skill.js";
import type { SkillCategory } from "../types/enums.js";

export const skillRepo = AppDataSource.getRepository(Skill);

export async function getSkillById(id: string): Promise<Skill | null> {
    return await skillRepo.findOneBy({
        id
    });
}

export async function getSkillByName(name: string): Promise<Skill | null> {
    return await skillRepo.findOneBy({
        name
    });
}

export async function getSkills(): Promise<Skill[]> {
    return await skillRepo.find({
        order: { name: "ASC" }
    });
}

export async function getSkillsByCategory(category: SkillCategory): Promise<Skill[]> {
    return await skillRepo.find({
        where: { category },
        order: { name: "ASC" }
    });
}

export async function createSkill(skill: Skill) {
    return await skillRepo.save(skill);
}

export async function updateSkill(skill: Skill) {
    return await skillRepo.save(skill);
}
