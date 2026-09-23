import { AppDataSource } from "../data-source.js";
import { Project } from "../entities/Project.js";
import type { ProjectStatus } from "../types/enums.js";

export const projectRepo = AppDataSource.getRepository(Project);

export async function getProjectById(id: string): Promise<Project | null> {
    return await projectRepo.findOneBy({
        id
    });
}

export async function getProjectByCompanyIdAndName(companyId: string, name: string): Promise<Project | null> {
    return await projectRepo.findOneBy({
        companyId,
        name
    });
}

export async function getProjectsByCompanyId(companyId: string): Promise<Project[]> {
    return await projectRepo.find({
        where: { companyId },
        order: { name: "ASC" }
    });
}

export async function getProjectsByCompanyIdAndStatus(companyId: string, status: ProjectStatus): Promise<Project[]> {
    return await projectRepo.find({
        where: { companyId, status },
        order: { name: "ASC" }
    });
}

export async function getProjectsByManagerId(managerId: string): Promise<Project[]> {
    return await projectRepo.find({
        where: { managerId },
        order: { name: "ASC" }
    });
}

export async function createProject(project: Project) {
    return await projectRepo.save(project);
}

export async function updateProject(project: Project) {
    return await projectRepo.save(project);
}
