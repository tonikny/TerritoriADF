# El context de build és l'arrel del repositori (vegeu docker-compose.yml),
# perquè les dependències s'instal·len amb el package-lock.json únic del
# monorepo (npm workspaces) en lloc de resoldre els rangs ^ a cada build.

# Estadi de construcció. Versió fixada a `.nvmrc` (26.13.0): local, CI i Docker
# han de compilar amb el mateix Node.
FROM node:26.13-alpine AS builder

WORKDIR /app

# Husky no ha de córrer dins la imatge (no hi ha .git)
ENV HUSKY=0

# Els manifests de tots els workspaces calen perquè npm ci valida el lock
COPY package.json package-lock.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/

# Dependències exactes del lockfile (vite inclòs: fa falta per al build).
# --ignore-scripts evita que el `prepare: husky` de l'arrel s'executi a la imatge.
RUN npm ci -w front --no-audit --no-fund --ignore-scripts

# Copiem el codi del frontend
COPY front ./front

# Build de l'aplicació Vite
RUN npm run build -w front

# Estadi de producció amb Nginx
FROM nginx:alpine

# Copiem els fitxers estàtics del build
COPY --from=builder /app/front/dist /usr/share/nginx/html

# Copiem la configuració personalitzada de Nginx
COPY front/nginx.conf /etc/nginx/conf.d/default.conf

# Exposem el port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
