FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./


# Desarrollo local: conserva nodemon y el montaje de codigo de Docker Compose.
FROM base AS development

ENV NODE_ENV=development

RUN npm ci

COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]


# Produccion/Railway: instala unicamente dependencias necesarias en runtime.
FROM base AS production

ENV NODE_ENV=production

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chown=node:node . .

USER node

EXPOSE 4000

CMD ["npm", "start"]
