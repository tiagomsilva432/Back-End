import { AppDataSource } from "../data-source.js";
import { Project } from "../entities/Project.js";

export const projectRepo = AppDataSource.getRepository(Project);
