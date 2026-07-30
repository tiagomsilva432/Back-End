# syntax=docker/dockerfile:1

# Single stage, on purpose. This image is for development: it keeps the dev
# dependencies (tsx, typescript) so the container can run `npm run dev` and
# reload on file changes, and so migrations run straight from src/ with no
# build step. A slim multi-stage build belongs here the day this gets deployed
# somewhere, not before.
#
# node:24-slim rather than alpine, but only as a mild preference: glibc hits
# fewer edge cases across the npm ecosystem. Nothing here requires it - bcrypt
# ships prebuilt binaries for every platform including musl, so alpine would
# also work and would save roughly 130MB if image size ever matters.

FROM node:24-slim
WORKDIR /app

COPY package.json ./
# npm install rather than npm ci: package-lock.json is gitignored in this repo,
# so a fresh clone has no lockfile for `ci` to read.
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
