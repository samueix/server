FROM node:22-alpine AS builder

WORKDIR /app

# Copia dependências
COPY package*.json ./
RUN npm ci

# Copia código-fonte
COPY . .

# Compila aplicação (Vite frontend + esbuild backend)
RUN npm run build

# Imagem de produção enxuta
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Fallback port se Cloud Run não injetar a variável PORT
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

# Cria diretório de dados
RUN mkdir -p data

# Copia arquivos compilados, assets públicos e código do servidor
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server

# Portas padrão (Cloud Run geralmente usa 8080, e ambiente local usa 3000)
EXPOSE 3000 8080

CMD ["node", "dist/server.cjs"]
