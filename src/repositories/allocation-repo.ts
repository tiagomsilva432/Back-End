import { AppDataSource } from "../data-source.js";
import { Allocation } from "../entities/Allocation.js";

export const allocationRepo = AppDataSource.getRepository(Allocation);
