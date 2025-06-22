# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development
RUN npm ci --include=dev
COPY . .
RUN npm run build
CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS build
RUN npm ci --only=production --ignore-scripts
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    libjpeg-turbo \
    freetype \
    ffmpeg \
    dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=build --chown=nextjs:nodejs /app/dist ./dist
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json

# Create directories for models and logs
RUN mkdir -p /app/models /app/logs && \
    chown -R nextjs:nodejs /app/models /app/logs

USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/cmd/ingest-api/index.js"] 