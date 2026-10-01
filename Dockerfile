FROM node:22-alpine

WORKDIR /app

# Admin attendance OCR (meeting screenshots) shells out to the Tesseract CLI.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-tur
ENV TESSERACT_PATH=/usr/bin/tesseract

# Run as the non-root `node` user baked into the base image. Switched before the
# build so node_modules and .next are created owned by `node` in the first place.
RUN chown node:node /app
USER node

COPY --chown=node:node package*.json ./
RUN npm ci && npm cache clean --force

COPY --chown=node:node . .

# Build-time public env vars. Secrets are injected at runtime by the deployment
# platform — never passed as build args or baked into image layers.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_BASE_URL
ARG APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV APP_URL=$APP_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
