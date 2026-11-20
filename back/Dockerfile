# El context de build és l'arrel del repositori (vegeu docker-compose.yml),
# perquè les dependències s'instal·len amb el package-lock.json únic del
# monorepo (npm workspaces) en lloc de resoldre els rangs ^ a cada build.

# Estadi de construcció. Versió fixada a `.nvmrc` (26.13.0): local, CI i Docker
# han de compilar amb el mateix Node.
FROM node:26.13-alpine AS builder

WORKDIR /app

# Husky no ha de córrer dins la imatge (no hi ha .git)
ENV HUSKY=0

# better-sqlite3 no té binari precompilat per a musl: es compila des del codi
# del lockfile (reproduïble) en lloc de dependre de si el prebuild existeix.
ENV npm_config_build_from_source=true

# Els manifests de tots els workspaces calen perquè npm ci valida el lock
COPY package.json package-lock.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/

# Dependències (incloses devDependencies) exactes del lockfile
# --ignore-scripts evita que el `prepare: husky` de l'arrel s'executi a la
# imatge; després es recompilen només els mòduls natius del backend.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci -w back --no-audit --no-fund --ignore-scripts \
 && npm rebuild -w back \
 && apk del .build-deps

# Copiem el codi del backend i compil·lem TypeScript
COPY back ./back
RUN npm run build -w back

# Estadi de dependències de producció
FROM node:26-alpine AS prod-deps

WORKDIR /app

ENV HUSKY=0
ENV npm_config_build_from_source=true

COPY package.json package-lock.json ./
COPY back/package.json ./back/
COPY front/package.json ./front/

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci -w back --omit=dev --no-audit --no-fund --ignore-scripts \
 && npm rebuild -w back

# Estadi de producció
FROM node:26-alpine

# curl per al healthcheck i libstdc++ per al binari compilat de better-sqlite3
RUN apk add --no-cache curl libstdc++

WORKDIR /app

ENV NODE_ENV=production

# Dependències de producció instal·lades des del lockfile
COPY --from=prod-deps /app/node_modules ./node_modules
# package.json del backend (script `start`: migrate + server)
COPY --from=prod-deps /app/back/package.json ./package.json

# El codi compilat ha d'anar a /app/dist: src/db/index.ts resol la BD com a
# dirname(dist/db) + ../../data => /app/data (el volum muntat per compose).
COPY --from=builder /app/back/dist ./dist
COPY --from=builder /app/back/drizzle ./drizzle

# Exposem el port intern (configurat al .env, per defecte 3033)
EXPOSE 3033

# Comanda per iniciar l'aplicació (aplica migracions i arrenca el servidor)
CMD ["npm", "start"]
