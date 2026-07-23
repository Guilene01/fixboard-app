# Build the static bundle
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite bakes env vars in at build time. Default targets the Kubernetes
# deployment, where nginx.conf reverse-proxies /api/ to the backend
# Service — pass --build-arg VITE_API_URL=http://localhost:3000 (or let
# docker-compose.yml's own build arg override this) for local dev.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Serve it with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
