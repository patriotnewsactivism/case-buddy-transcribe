# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (include devDependencies for build tooling)
COPY package*.json ./
RUN npm install

# Build application
COPY . .

# Forward secrets for build-time replacement in Vite
ARG GEMINI_API_KEY
ARG GOOGLE_DRIVE_CLIENT_ID
ARG GOOGLE_DRIVE_API_KEY
ARG OPENAI_API_KEY
ARG ASSEMBLYAI_API_KEY

ENV GEMINI_API_KEY=${GEMINI_API_KEY}
ENV GOOGLE_DRIVE_CLIENT_ID=${GOOGLE_DRIVE_CLIENT_ID}
ENV GOOGLE_DRIVE_API_KEY=${GOOGLE_DRIVE_API_KEY}
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY}

RUN npm run build

# Production stage
FROM nginx:1.27-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
