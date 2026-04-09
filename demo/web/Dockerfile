FROM oven/bun:1 AS build

WORKDIR /app

ARG VITE_DEMO_API_BASE_URL=/api
ENV VITE_DEMO_API_BASE_URL=${VITE_DEMO_API_BASE_URL}

COPY package.json bun.lock tsconfig.json tsconfig.node.json postcss.config.cjs tailwind.config.ts index.html ./
COPY src ./src

RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
