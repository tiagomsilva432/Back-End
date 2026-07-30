# syntax=docker/dockerfile:1

# node:24-slim rather than alpine on purpose: bcrypt is a native addon and has
# no prebuilt musl binary, so alpine would have to compile it from source and
# would need build-base + python3 in the image.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json ./
# `npm install`, not `npm ci`: package-lock.json is gitignored in this repo, so
# a fresh clone has no lockfile for `ci` to read. The trade-off is that builds
# resolve dependency versions afresh rather than reproducibly.
RUN npm install

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm ins  tall --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
