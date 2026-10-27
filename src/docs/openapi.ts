import { createDocument } from "zod-openapi";
import { healthPaths } from "../routes/health-routes.js";
import { authPaths } from "../routes/auth-routes.js";
import { companyPaths } from "../routes/company-routes.js";
import { projectPaths } from "../routes/project-routes.js";
import { userPaths } from "../routes/user-routes.js";
import { allocationPaths } from "../routes/allocation-routes.js";
import { skillPaths } from "../routes/skill-routes.js";
import { salaryPaths } from "../routes/salary-routes.js";
import { reviewPaths } from "../routes/review-routes.js";
import { announcementPaths } from "../routes/announcement-routes.js";
import { notificationPaths } from "../routes/notification-routes.js";
import { absencePaths } from "../routes/absence-routes.js";
import { calendarPaths } from "../routes/calendar-routes.js";
import { expensePaths } from "../routes/expense-routes.js";
import { financePaths } from "../routes/finance-routes.js";
import { filePaths } from "../routes/file-routes.js";
import { projectResourcePaths } from "../routes/project-resource-routes.js";
import { projectMessagePaths } from "../routes/project-message-routes.js";
import { projectTaskPaths } from "../routes/project-task-routes.js";
import { apiPublicUrl } from "../env-vars.js";
import { docsPaths } from "./docs-paths.js";

export const openApiDocument: ReturnType<typeof createDocument> = createDocument({
    openapi: "3.1.0",
    info: {
        title: "API - Projeto Final",
        version: "1.0.0",
        description: "Documentação gerada a partir dos schemas Zod (DTOs).",
    },
    servers: [
        {
            url: apiPublicUrl(),
            description: "Servidor da API",
        },
    ],
    tags: [
        { name: "Sistema", description: "Estado e diagnóstico da API" },
        { name: "Auth", description: "Autenticação e gestão de contas" },
        { name: "Empresas", description: "Gestão de empresas" },
        { name: "Projetos", description: "Gestão de projetos" },
        { name: "Recursos", description: "Links, notas e ficheiros úteis de um projeto, para quem está nele" },
        { name: "Chat", description: "As mensagens de um projeto, e o que falta ler" },
        { name: "Tarefas", description: "O quadro de cada projeto: tarefas, anexos e comentários" },
        { name: "Utilizadores", description: "Diretório de pessoas e perfis" },
        { name: "Alocações", description: "Quem trabalha em quê" },
        { name: "Competências", description: "O catálogo de competências e quem as tem" },
        { name: "Salários", description: "Histórico de salários de cada pessoa" },
        { name: "Avaliações", description: "Avaliações entre colegas para decidir aumentos" },
        { name: "Avisos", description: "Avisos do sistema, de uma empresa ou de um projeto" },
        { name: "Notificações", description: "A caixa de cada pessoa, e o stream em direto" },
        { name: "Ausências", description: "Pedidos de férias, baixas e outras ausências, e quem os aprova" },
        { name: "Calendário", description: "Feriados e ausências, da empresa ou de um projeto" },
        { name: "Despesas", description: "O que se gasta num projeto, ou na própria empresa" },
        { name: "Finanças", description: "O painel da empresa, e o orçamento de cada projeto" },
        { name: "Ficheiros", description: "Os links dos avatares, dos recibos e dos documentos das ausências" },
        { name: "Ficheiros", description: "Os links dos avatares, recibos e documentos" },
    ],
    paths: {
        ...healthPaths,
        ...docsPaths,
        ...authPaths,
        ...companyPaths,
        ...projectPaths,
        ...userPaths,
        ...allocationPaths,
        ...skillPaths,
        ...salaryPaths,
        ...reviewPaths,
        ...announcementPaths,
        ...notificationPaths,
        ...absencePaths,
        ...calendarPaths,
        ...expensePaths,
        ...financePaths,
        ...filePaths,
        ...projectResourcePaths,
        ...projectMessagePaths,
        ...projectTaskPaths,
    },
    // Os schemas entram sozinhos: cada um com .meta({ id }) é registado ao ser usado.
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
    },
});
