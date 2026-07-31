FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --filter @7dgame/plugin-whitelabel-backend

COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN pnpm --filter @7dgame/plugin-whitelabel-backend build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install \
  --frozen-lockfile \
  --prod \
  --filter @7dgame/plugin-whitelabel-backend

COPY --from=build /workspace/backend/dist ./backend/dist

USER node
WORKDIR /workspace/backend
EXPOSE 8093
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8093)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
