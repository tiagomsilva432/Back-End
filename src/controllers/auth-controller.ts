import { Response, Request, NextFunction } from "express";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { envIsDev, BASE_URL, PORT } from "../env-vars.js";
import { createUser, getUserByEmailAndCompanyId } from "../repositories/user-repo.js";
import { User } from "../entities/User.js"



export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { company_id, email, role } = req.body;
        const user: User | null = await getUserByEmailAndCompanyId(email, company_id);

        if(user){
            return next(new HttpError(409, "Não foi possível criar a conta."));
        }
        
        const newUser = new User(company_id, email, role);

        const created: User = await createUser(newUser);

        const activationUrl: string = `${BASE_URL}:${PORT}/auth/account/activate?token=${created.signupToken}`

        console.log(`Conta Criada - URL Ativação: ${activationUrl}`);

        return new HttpResponse(201, "Conta criada", undefined, created).send(res);
        
    } catch (error) {
        next(error)
    }
}