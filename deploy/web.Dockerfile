# syntax=docker/dockerfile:1

# The frontend, built and served by Caddy together with the reverse proxy.
# The `frontend` context is the Front-End repository (see compose.prod.yaml).

FROM node:24-slim AS build
WORKDIR /fe

COPY --from=frontend package.json ./
RUN npm install

# Only what the build needs: never the host's node_modules or dist.
COPY --from=frontend index.html vite.config.js ./
COPY --from=frontend public ./public
COPY --from=frontend src ./src

# Same origin as the API, so the browser calls /api and CORS never comes into it.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build


FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /fe/dist /srv
