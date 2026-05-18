FROM node:20-alpine
WORKDIR /app
COPY package.json index.mjs ./
ENV NODE_ENV=production
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3002/__purge/health || exit 1
CMD ["node", "index.mjs"]
