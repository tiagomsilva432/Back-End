import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";

export const userRepo = AppDataSource.getRepository(User);