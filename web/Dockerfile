FROM oven/bun:1 AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json bun.lock tsconfig.json tsconfig.node.json postcss.config.cjs tailwind.config.ts index.html ./
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
