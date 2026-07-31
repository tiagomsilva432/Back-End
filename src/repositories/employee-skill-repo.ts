import { AppDataSource } from "../data-source.js";
import { EmployeeSkill } from "../entities/EmployeeSkill.js";

export const employeeSkillRepo = AppDataSource.getRepository(EmployeeSkill);
