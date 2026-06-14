# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY ./smart-light-frontend/package.json ./smart-light-frontend/package-lock.json ./

RUN npm ci

COPY ./smart-light-frontend ./

# Build-time API URL — di Docker, frontend proxy ke /api lewat nginx
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage — Nginx serve static + proxy API
FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY ./nginx/frontend.conf /etc/nginx/conf.d/frontend.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
