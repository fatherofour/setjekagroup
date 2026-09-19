# Setjeka ERP — frontend (Next.js, standalone output)
#
# Static export isn't viable here: /projects/[id] and /contractors/[id] are
# fully dynamic, user-created IDs with no fixed set at build time. This runs
# `node server.js` from Next's traced-dependency standalone build instead.
#
# NEXT_PUBLIC_API_URL is baked in at BUILD time (Next.js inlines
# NEXT_PUBLIC_* vars into the client bundle) — pass it as a build arg
# matching wherever nginx will proxy /api to in the deployed environment.

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Docker auto-sets HOSTNAME to the container ID for every container, and
# Next's generated server.js does `process.env.HOSTNAME || '0.0.0.0'` — so
# without this override it binds to that container-ID "hostname" (which
# resolves only to the container's own bridge IP) instead of all
# interfaces, and nothing outside the container network can reach it.
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
