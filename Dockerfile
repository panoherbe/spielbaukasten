FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NODE_NO_WARNINGS=1
COPY package.json ./
COPY src ./src
COPY inhalte ./inhalte
COPY docs/openapi.json ./docs/openapi.json
COPY tools ./tools
RUN mkdir -p /daten && chown node:node /daten
USER node
ENV SBK_DATEN=/daten PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/gesundheit >/dev/null || exit 1
CMD ["node", "src/server/start.js"]
