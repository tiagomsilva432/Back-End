import { AppDataSource } from "../data-source.js";
import { Review } from "../entities/Review.js";

export const reviewRepo = AppDataSource.getRepository(Review);
