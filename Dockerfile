# A single, simple stage rather than a size-optimized multi-stage build --
# devDependencies (typescript, prisma CLI, vitest) stay in the final image.
# That's a deliberate tradeoff: `prisma migrate deploy` at container
# startup (below) needs the `prisma` CLI, which is a devDependency, and
# this matches exactly how railway.json's startCommand already works (it
# also relies on devDependencies being present). Trimming the image down
# with a prune step is a reasonable later optimization, but it has to be
# done carefully -- `npm prune --omit=dev` would remove the `prisma`
# package itself, breaking that startup migration step, unless you move
# `prisma` into "dependencies" first.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first, separately from the rest of the source, so
# Docker's layer cache skips this (slow) step on rebuilds where only
# application code changed, not package.json.
COPY package.json package-lock.json ./
# --ignore-scripts: package.json's postinstall hook runs `prisma
# generate`, which needs prisma/schema.prisma -- not copied in yet at
# this point (deliberately, so this layer caches on package.json alone
# and doesn't get invalidated by every source change). Generating the
# Prisma client explicitly below, once the full source is in, also makes
# that step visible in this file instead of an implicit side effect of
# npm ci.
RUN npm ci --ignore-scripts

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Apply any pending migrations, then start -- the same pattern
# railway.json's startCommand uses, so this container and the Railway
# deploy behave identically.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
