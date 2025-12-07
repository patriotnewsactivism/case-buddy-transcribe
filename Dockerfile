# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (including devDependencies needed for build)
COPY package*.json ./
RUN npm install

# Build application
COPY . .

# Forward API key for build-time replacement in Vite
ARG API_KEY
ENV API_KEY=${API_KEY}

RUN npm run build

# Production stage
FROM nginx:1.27-alpine

ENV NODE_ENV=production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
