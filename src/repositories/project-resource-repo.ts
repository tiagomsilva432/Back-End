import { AppDataSource } from "../data-source.js";
import { ProjectResource } from "../entities/ProjectResource.js";

export const projectResourceRepo = AppDataSource.getRepository(ProjectResource);

export async function getProjectResourceById(id: string): Promise<ProjectResource | null> {
    return await projectResourceRepo.findOneBy({
        id
    });
}

/** Pela ordem em que foram adicionados: o id é uuidv7, que ordena pelo tempo. */
export async function getProjectResourcesByProjectId(projectId: string): Promise<ProjectResource[]> {
    return await projectResourceRepo.find({
        where: { projectId },
        order: { id: "ASC" }
    });
}

export async function createProjectResource(resource: ProjectResource) {
    return await projectResourceRepo.save(resource);
}

export async function updateProjectResource(resource: ProjectResource) {
    return await projectResourceRepo.save(resource);
}

export async function deleteProjectResource(id: string) {
    return await projectResourceRepo.delete({
        id
    });
}
