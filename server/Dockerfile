# Servidor de partidas clasificatorias de Musazo (Fly.io, Railway, cualquier sitio con Docker).
# Se construye desde la raíz del repositorio:  docker build -f server/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
