import { AppDataSource } from "../data-source.js";
import { ReviewCycle } from "../entities/ReviewCycle.js";

export const reviewCycleRepo = AppDataSource.getRepository(ReviewCycle);
