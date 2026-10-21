FROM node:22.20.0-bookworm-slim

# Native OCR stays inside this container. No document leaves for recognition.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por poppler-utils \
    && model="$(find /usr/share/tesseract-ocr -type f -name por.traineddata -print -quit)" \
    && test -n "$model" \
    && cp -R "$(dirname "$model")" /opt/lume-tessdata \
    && tesseract --version \
    && tesseract --tessdata-dir /opt/lume-tessdata --list-langs | grep -Fx por \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src ./src
ENV NODE_ENV=production \
    PORT=5001 \
    LUME_OCR_ENABLED=true \
    LUME_TESSERACT_PATH=/usr/bin/tesseract \
    LUME_TESSDATA_PATH=/opt/lume-tessdata \
    LUME_PDFTOPPM_PATH=/usr/bin/pdftoppm
USER node
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
