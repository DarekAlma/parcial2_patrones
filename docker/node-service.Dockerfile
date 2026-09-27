# -----------------------------------------------------------------------------
# Imagen genérica para los microservicios Node (gateway, flights, hotels, cars,
# orders, migrator). Se construye una vez por servicio con --build-arg SERVICE.
# -----------------------------------------------------------------------------
FROM node:22-slim AS build
ARG SERVICE
WORKDIR /app

# 1) Solo manifiestos: la capa de dependencias se cachea mientras no cambien.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY services/migrator/package.json services/migrator/
COPY services/flights/package.json services/flights/
COPY services/hotels/package.json services/hotels/
COPY services/cars/package.json services/cars/
COPY services/orders/package.json services/orders/
COPY services/gateway/package.json services/gateway/
# npm ci: instalación reproducible desde el lockfile, sin devDependencies y
# solo con las dependencias del servicio que se está construyendo.
RUN npm ci --omit=dev --workspace=@wandersync/${SERVICE} --no-audit --no-fund

# 2) Código fuente.
COPY packages/common packages/common
COPY services/${SERVICE} services/${SERVICE}
COPY db db

FROM node:22-slim
ARG SERVICE
ENV NODE_ENV=production SERVICE=${SERVICE} SERVICE_NAME=${SERVICE}
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Usuario sin privilegios incluido en la imagen oficial.
USER node
CMD ["sh", "-c", "exec node services/$SERVICE/src/index.js"]
