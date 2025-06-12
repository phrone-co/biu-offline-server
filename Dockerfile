FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install -g pm2 && npm install --omit=dev

COPY ecosystem.config.js ./

COPY . .
# Copy production environment variables
RUN cp .env.production .env

# Expose the port your app runs on (adjust if needed)
COPY . .

EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production", "--no-daemon"]



# 🔹 Stage 1: Build & Minify Code
# FROM node:20 AS builder

# # Set working directory
# WORKDIR /app

# # Copy package.json and package-lock.json for efficient caching
# COPY package*.json ./

# # Install dependencies
# RUN npm install --production

# # Copy source files
# COPY . .

# # Install esbuild for fast bundling
# RUN npm install -g esbuild

# # Bundle & minify only your app's JavaScript files, ignoring node_modules and public
# RUN find . -type f -name "*.js" ! -path "./public/*" ! -path "./node_modules/*" -exec esbuild {} --bundle --minify --platform=node --outfile={} \;

# # Copy environment file
# RUN cp .env.production .env


# # 🔹 Stage 2: Run the App with PM2
# FROM node:20

# # Set working directory
# WORKDIR /app

# # Install PM2 globally
# RUN npm install -g pm2

# # Copy only the necessary files from the build stage
# # Copy only the required files from builder stage
# COPY --from=builder /app/package*.json ./
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/ecosystem.config.js ./ecosystem.config.js
# COPY --from=builder /app/.env .env
# COPY --from=builder /app/public ./public

# # Copy only the minified app files (excluding public & unnecessary files)
# COPY --from=builder /app/app.js ./

# # Expose the port the app runs on
# EXPOSE 3000

# # Start the application using PM2
# CMD ["pm2-runtime", "start", "ecosystem.config.js"]
