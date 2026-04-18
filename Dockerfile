FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma/
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
