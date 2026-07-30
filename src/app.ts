import express, { Request, Response } from "express";
import { HttpResponse } from "./dtos/common/responses.dto.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import docsRouter from "./routes/docs.js";
import healthRouter from "./routes/health.js";

export const app = express();
//Middlewares globais
app.use(express.json());
app.use(requestLogger);



//Rotas
app.use(docsRouter);
app.use(healthRouter);

//Rota não encontrada
app.use((_req: Request, res: Response) => {
    new HttpResponse(404).send(res);
});

//Tratamento de erros
app.use(errorHandler);