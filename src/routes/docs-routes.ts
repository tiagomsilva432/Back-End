import { Router, Request, Response } from "express";
import { openApiDocument } from "../docs/openapi.js";

const router = Router();

//Especificação em JSON
router.get("/docs.json", (_req: Request, res: Response) => {
    res.json(openApiDocument);
});

//UI para ler/testar a documentação
router.get("/docs", (_req: Request, res: Response) => {
    res.type("html").send(`<!doctype html>
<html>
  <head>
    <title>API - Projeto Final</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', { url: '/docs.json' });
    </script>
  </body>
</html>`);
});

//A documentação OpenAPI destas rotas vive em ../docs/docs-paths.ts:
//ao contrário das outras, este ficheiro já importa o openapi.ts e declará-la
//aqui criava um ciclo de imports.

export default router;