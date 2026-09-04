import express, { Request, Response } from "express";
import { HttpResponse } from "./dtos/common/responses-dto.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import docsRouter from "./routes/docs-routes.js";
import healthRouter from "./routes/health-routes.js";
import authRouter from "./routes/auth-routes.js"

export const app = express();
//Middlewares globais
app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);



//Rotas
app.use(docsRouter);
app.use(healthRouter);
app.use(authRouter);

//Rota não encontrada
app.use((_req: Request, res: Response) => {
    new HttpResponse(404).send(res);
});

//Tratamento de erros
app.use(errorHandler);