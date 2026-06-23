FROM node:24-alpine

WORKDIR /app

RUN npm install -g npm@11.14.1

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY src ./src

# Generate Prisma Client with dummy URL for build time
RUN DATABASE_URL="mysql://dummy:dummy@localhost:3306/dummy" npx prisma generate

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node prisma/seed.js && node src/index.js"]
