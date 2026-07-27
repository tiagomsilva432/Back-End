import express, { Request, Response } from "express";
import { HttpResponse } from "./dtos/common/responses.dto.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(express.json());

//Rota não encontrada
app.use((_req: Request, res: Response) => {
    new HttpResponse(404).send(res);
});

//Tratamento de erros
app.use(errorHandler);