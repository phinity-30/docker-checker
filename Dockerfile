FROM node:22-alpine

WORKDIR /app

# Copy application files
COPY package.json ./
COPY src ./src
COPY public ./public

# Create persistent data directory for custom merged groups
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV DOCKER_SOCKET=/var/run/docker.sock

EXPOSE 3000

CMD ["node", "src/server.js"]
