import { Response, Request, NextFunction } from "express";
import { CreateAccountRequest } from "../dtos/auth/account-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import { UserRole } from "../types/enums.js";
import { randomUUID } from "node:crypto";
import { envIsDev, BASE_URL, PORT, signupTokenExpDate } from "../env-vars.js";
import { userRepo } from "../repositories/user-repo.js";
import { User } from "../entities/User.js"



export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const request: CreateAccountRequest = req.body;
        const user: User | null = await userRepo.findOneBy({
            email: request.email, 
            companyId: request.company_id
        });
        if(user){
            return next(new HttpError(409, "Email já registado!"));
        }
        const newUser = userRepo.create({
            companyId: request.company_id,
            email: request.email,
            role: request.role ?? UserRole.Employee,
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now()+signupTokenExpDate()),
        });

        const created: User = await userRepo.save(newUser);
        const activationUrl: string = `${BASE_URL}:${PORT}/auth/account/activate?token=${created.signupToken}`

        if(envIsDev){
            return console.log(`Conta Criada - URL Ativação: ${activationUrl}`);
        }
        //Enviar email com link
        console.log("MODO ESTÁ COMO PRODUÇÃO");
        
        return new HttpResponse(201, "Conta criada", undefined, created).send(res);
    } catch (error) {
        next(error)
    }
}