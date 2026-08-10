# Desarrollo local: Docker Compose selecciona esta etapa y conserva Vite en el puerto 5173.
FROM node:20-alpine AS development

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


# Producción/Railway: compila el frontend y publica únicamente la carpeta dist.
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# Railway solo expone variables al build de Docker cuando el Dockerfile
# declara explicitamente cada una mediante ARG.
ARG VITE_API_BASE_URL
ARG VITE_APP_NAME
ARG VITE_APP_TAGLINE
ARG VITE_APP_COMPANY_NAME
ARG VITE_PDF_FOOTER_TEXT
ARG VITE_LOGO_MAX_SIZE_MB
ARG VITE_RETURN_EVENT_FEATURE_ENABLED

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_TAGLINE=$VITE_APP_TAGLINE
ENV VITE_APP_COMPANY_NAME=$VITE_APP_COMPANY_NAME
ENV VITE_PDF_FOOTER_TEXT=$VITE_PDF_FOOTER_TEXT
ENV VITE_LOGO_MAX_SIZE_MB=$VITE_LOGO_MAX_SIZE_MB
ENV VITE_RETURN_EVENT_FEATURE_ENABLED=$VITE_RETURN_EVENT_FEATURE_ENABLED

RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["npm", "start"]
