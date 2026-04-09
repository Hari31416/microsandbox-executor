FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY vendor ./vendor
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run build

FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN node node_modules/microsandbox/postinstall.js

EXPOSE 3000

CMD ["node", "dist/server.js"]
