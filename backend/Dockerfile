FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ linux-headers

# ── Chromium + خطوط عربية لتوليد تقارير PDF عبر Puppeteer ──
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-arabic \
  && fc-cache -f
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4000

CMD ["npx", "tsx", "src/index.ts"]
