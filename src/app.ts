import express, { type Request, type Response } from "express";
import { HttpResponse } from "./dtos/common/responses-dto.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import docsRouter from "./routes/docs-routes.js";
import healthRouter from "./routes/health-routes.js";
import authRouter from "./routes/auth-routes.js"
import companyRouter from "./routes/company-routes.js"
import projectRouter from "./routes/project-routes.js"
import userRouter from "./routes/user-routes.js"
import allocationRouter from "./routes/allocation-routes.js"
import skillRouter from "./routes/skill-routes.js"
import salaryRouter from "./routes/salary-routes.js"
import reviewRouter from "./routes/review-routes.js"
import announcementRouter from "./routes/announcement-routes.js"
import notificationRouter from "./routes/notification-routes.js"
import absenceRouter from "./routes/absence-routes.js"
import calendarRouter from "./routes/calendar-routes.js"
import expenseRouter from "./routes/expense-routes.js"
import financeRouter from "./routes/finance-routes.js"

export const app = express();
//Middlewares globais
app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);

//Rotas
app.use(docsRouter);
app.use(healthRouter);
app.use(authRouter);
app.use(companyRouter);
app.use(projectRouter);
app.use(userRouter);
app.use(allocationRouter);
app.use(skillRouter);
app.use(salaryRouter);
app.use(reviewRouter);
app.use(announcementRouter);
app.use(notificationRouter);
app.use(absenceRouter);
app.use(calendarRouter);
app.use(expenseRouter);
app.use(financeRouter);

//Rota não encontrada
app.use((_req: Request, res: Response) => {
    new HttpResponse(404).send(res);
});

//Tratamento de erros
app.use(errorHandler);