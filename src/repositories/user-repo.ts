import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";

export const userRepo = AppDataSource.getRepository(User);

export async function getUserByEmailAndCompanyId(email: string, companyId: number): Promise< User | null > {
    return await userRepo.findOneBy({
        email,
        companyId
    });
}

export async function createUser(user: User){
    return await userRepo.save(user);
}