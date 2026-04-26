FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ linux-headers

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4000

CMD ["npx", "tsx", "src/index.ts"]
