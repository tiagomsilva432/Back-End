import { AppDataSource } from "../data-source.js";
import { ReviewRequest } from "../entities/ReviewRequest.js";

export const reviewRequestRepo = AppDataSource.getRepository(ReviewRequest);
