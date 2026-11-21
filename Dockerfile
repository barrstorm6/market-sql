FROM node:22-bookworm-slim
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
CMD ["node", "grader/cli.js"]
