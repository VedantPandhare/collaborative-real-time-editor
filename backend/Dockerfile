# Use standard Node 20 image (good for production)
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files separately for layer caching
COPY package.json ./
# SQLite binaries sometimes need specific installation settings
RUN npm install --omit=dev

# Copy the rest of the backend source code
COPY . .

# Ensure the app starts on 0.0.0.0 for Docker networking
ENV HOST=0.0.0.0
ENV PORT=4000

# Expose backend port
EXPOSE 4000

# Run the server.js file directly (as per package.json scripts)
CMD ["node", "server.js"]
