import { AppDataSource } from "../data-source.js";
import { EmployeeProfile } from "../entities/EmployeeProfile.js";

export const employeeProfileRepo = AppDataSource.getRepository(EmployeeProfile);

export async function getEmployeeProfileByUserId(userId: string): Promise<EmployeeProfile | null> {
    return await employeeProfileRepo.findOneBy({
        userId
    });
}

export async function createEmployeeProfile(profile: EmployeeProfile) {
    return await employeeProfileRepo.save(profile);
}

export async function updateEmployeeProfile(profile: EmployeeProfile) {
    return await employeeProfileRepo.save(profile);
}
