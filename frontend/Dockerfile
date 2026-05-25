# =========== Stage 1: build estático con Vite ===========
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_BASE_URL etc. pueden inyectarse aquí con --build-arg si se necesitan
RUN npm run build

# =========== Stage 2: nginx sirviendo el bundle ===========
FROM nginx:1.27-alpine

# Config: SPA con fallback a /index.html para react-router
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q -O - http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
