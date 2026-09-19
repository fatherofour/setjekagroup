# Setjeka ERP — backend (NestJS)
#
# Uses @prisma/adapter-pg (driver adapters), not Prisma's Rust query engine —
# so there's no native-binary-per-platform concern here, unlike a classic
# Prisma Client build. `prisma migrate deploy` still needs the `prisma` CLI
# (a devDependency), so the runtime stage keeps the full node_modules from
# the build stage rather than reinstalling prod-only deps.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma7.config.ts ./prisma7.config.ts
# prisma/seed.ts is run directly via tsx (not compiled), and imports the
# generated Prisma client from its source path — dist/ alone isn't enough
# for that one script to resolve.
COPY --from=build /app/src/generated ./src/generated

EXPOSE 4000

# migrate deploy is idempotent (applies only pending migrations) so it's
# safe to run on every container start, not just the first deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
