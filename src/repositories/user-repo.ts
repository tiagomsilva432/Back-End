import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";

export const userRepo = AppDataSource.getRepository(User);

export async function getUserByEmailAndCompanyId(email: string, companyId: number): Promise< User | null > {
    return await userRepo.findOneBy({
        email,
        companyId
    });
}

export async function getUserById(id: number): Promise <User | null> {
    return await userRepo.findOneBy({
        id
    });
}

export async function getUserByEmail(email: string): Promise <User | null> {
    return await userRepo.findOneBy({
        email
    });
}

export async function getUserBySignupToken(signupToken:string): Promise <User | null> {
    return await userRepo.findOneBy({
        signupToken
    });
}

export async function updateUser(user: User){
    return await userRepo.save(user);
}

export async function createUser(user: User){
    return await userRepo.save(user);
}