FROM node:20-slim

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./

RUN apt-get update && apt-get install -y curl

RUN groupadd -r appuser && useradd -r -g appuser -d /usr/src/app -s /sbin/nologin -c "Docker image user" appuser && chown -R appuser:appuser /usr/src/app

RUN npm install -g pnpm && pnpm install

COPY --chown=appuser:appuser . .

USER appuser

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start:prod"]
