# Stage 1: Build the React application
FROM node:20-slim AS build

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./

# Install dependencies.
RUN npm install

# Copy local code to the container image.
COPY . .

# Build the application.
RUN npm run build

# Stage 2: Serve the static files using Nginx
FROM nginx:stable-alpine

# Copy the built application from the build stage.
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

# Expose port 80.
EXPOSE 80

# Start Nginx.
CMD ["nginx", "-g", "daemon off;"]
