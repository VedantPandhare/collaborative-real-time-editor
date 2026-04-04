# 1. Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Set environment variables for Vite build-time
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Build the static assets
RUN npm run build

# 2. Serve with Nginx
FROM nginx:alpine AS runner

# Copy the static build files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Use a custom Nginx config for SPA routing (optional, but good for React Router)
RUN echo "server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
