import { Response, Request, NextFunction } from "express";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import { CreateAccountRequest } from "../dtos/auth/account.dto.js";
import { HttpResponse } from "../dtos/common/responses.dto.js";
import { HttpError } from "../dtos/common/errors.dto.js";
import { USER_ROLES } from "../types/enums.js";
import { randomUUID } from "node:crypto";
import { envIsDev, BASE_URL, PORT } from "../utils/consts.js";

const userRepository = AppDataSource.getRepository(User);

//Criar User/Conta

export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const request: CreateAccountRequest = req.body;
        const SIGNUP_TOKEN_EXPIRATION_MS: number = 168 * 60 * 60 * 1000;
        const user: User | null = await userRepository.findOneBy({
            email: request.email, 
            companyId: request.company_id
        });
        if(user){
            return next(new HttpError(409, "Email já registado!"));
        }
        const newUser = userRepository.create({
            companyId: request.company_id,
            email: request.email,
            role: request.role ?? USER_ROLES[1],
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now()+SIGNUP_TOKEN_EXPIRATION_MS),
        });

        const created: User = await userRepository.save(newUser);
        const ACTIVATION_URL: string = `${BASE_URL}:${PORT}/auth/account/activate?token=${created.signupToken}`

        if(envIsDev){
            console.log(`Conta Criada - URL Ativação: ${ACTIVATION_URL}`);
        }
        else{
            //Enviar email com link
            console.log("MODO ESTÁ COMO PRODUÇÃO");
        }
        
        return new HttpResponse(201, "Conta criada", undefined, created).send(res);
    } catch (error) {
        next(error)
    }
}