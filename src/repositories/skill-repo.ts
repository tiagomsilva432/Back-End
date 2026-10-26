import { Raw } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Skill } from "../entities/Skill.js";
import type { SkillCategory } from "../types/enums.js";

export const skillRepo = AppDataSource.getRepository(Skill);

export async function getSkillById(id: string): Promise<Skill | null> {
    return await skillRepo.findOneBy({
        id
    });
}

/** Sem distinguir maiúsculas: "react" e "React" seriam a mesma competência duas vezes. */
export async function getSkillByNameIgnoringCase(name: string): Promise<Skill | null> {
    return await skillRepo.findOneBy({
        name: Raw((alias) => `LOWER(${alias}) = LOWER(:name)`, { name })
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
