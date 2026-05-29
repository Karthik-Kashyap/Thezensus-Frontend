# Next.js standalone build for the web-service (DESIGN-001 §6.1).
FROM node:20-slim AS build
WORKDIR /app

# Empty default => the client calls a RELATIVE "/api/..." which is same-origin with
# the page (both served by the ALB), so no CORS and no need to know the ALB DNS at
# build time. Override with --build-arg to point at an absolute API origin.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
# HOSTNAME=0.0.0.0 so the standalone server is reachable on the task ENI for ALB health checks.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
