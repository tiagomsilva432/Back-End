//Ambiente
export const envIsDev: boolean = process.env.NODE_ENV !== "production";
//URLS
export const BASE_URL: string = String(process.env.BASE_URL);
export const PORT: number = Number(process.env.PORT);
//Auth
export const signupTokenExpDate = (): number => {
    return (Number(process.env.SIGNUP_TOKEN_EXPIRATION_DAYS) * 24) * 60 * 60 * 1000;
};