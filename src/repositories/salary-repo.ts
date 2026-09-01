import { AppDataSource } from "../data-source.js";
import { Salary } from "../entities/Salary.js";

export const salaryRepo = AppDataSource.getRepository(Salary);
