FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Backend URL for Next.js rewrites (Docker internal network)
ENV BACKEND_URL=http://backend:4000
ENV NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_SOCKET_URL=

# حقن BUILD_HASH تلقائياً في sw.js — كل deploy يحصل على hash جديد
RUN BUILD_HASH=$(date +%s) && \
    sed -i "s/__BUILD_HASH__/$BUILD_HASH/g" public/sw.js

RUN npm run build

# ── Production Stage ──
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
