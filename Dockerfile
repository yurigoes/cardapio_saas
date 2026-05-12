FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat necessário para libs nativas (sharp, bcrypt, etc.) em Alpine
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_PHASE=phase-production-build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime libs nativas
RUN apk add --no-cache libc6-compat

# Usuário não-root por segurança
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Sharp e web-push não são incluídos automaticamente pelo standalone trace
# (acessados em runtime por API routes). Copia explicitamente.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp     ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/web-push  ./node_modules/web-push

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
