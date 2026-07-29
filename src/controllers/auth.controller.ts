import { Response, Request, NextFunction } from "express";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";
import { CreateAccountRequest } from "../dtos/auth/account.dto.js";
import { HttpResponse } from "../dtos/common/responses.dto.js";
import { HttpError } from "../dtos/common/errors.dto.js";

const userRepository = AppDataSource.getRepository(User);

//Criar User/Conta

export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const request: CreateAccountRequest = req.body;
        const user: User | null = await userRepository.findOneBy({email: request.email});
        if(user){
            return next(new HttpError(409, "Email já registado!"));
        }
    } catch (error) {
        next(error)
    }
}