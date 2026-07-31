import { AppDataSource } from "../data-source.js";
import { EmployeeProfile } from "../entities/EmployeeProfile.js";

export const employeeProfileRepo = AppDataSource.getRepository(EmployeeProfile);
