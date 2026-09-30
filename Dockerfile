FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY tests ./tests
COPY src ./src
ARG SITE_URL=https://krzem.si/
ENV SITE_URL=${SITE_URL}
RUN npm run verify

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
