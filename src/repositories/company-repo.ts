import { AppDataSource } from "../data-source.js";
import { Company } from "../entities/Company.js";

export const companyRepo = AppDataSource.getRepository(Company);
