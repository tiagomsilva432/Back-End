export const envIsProd: boolean = process.env.NODE_ENV === "production"
export const envIsDev: boolean = !envIsProd;

export const BASE_URL: string = String(process.env.BASE_URL);
export const PORT: number = Number(process.env.PORT);