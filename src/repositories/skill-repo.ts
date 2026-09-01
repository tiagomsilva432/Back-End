import { AppDataSource } from "../data-source.js";
import { Skill } from "../entities/Skill.js";

export const skillRepo = AppDataSource.getRepository(Skill);
