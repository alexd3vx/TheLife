# Game server image (Fly.io or any Docker host). Build from the repository root: docker build -t thelife-server .
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @thelife/server...
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@thelife/server", "start"]
