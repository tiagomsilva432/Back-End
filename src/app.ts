import express, { Request, Response, NextFunction } from "express";

export const app = express();

app.use(express.json());

app.use((_req: Request, res: Response) => {
    res.status(404).json({ Erro: "Rota não encontrada!" });
});

app.use((_err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ Erro: "Erro de servidor!" });
});