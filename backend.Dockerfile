FROM node:20-slim

# Install Python and dependencies required by OpenCV and the AI pipeline
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Set up Python environment
COPY ai/requirements.txt ./ai/
RUN python3 -m venv ai/.venv
RUN ai/.venv/bin/pip install --no-cache-dir -r ai/requirements.txt

# 2. Set up Node backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# 3. Copy source files
COPY backend/ ./backend/
COPY ai/ ./ai/

# 4. Build backend
RUN cd backend && npm run build

# 5. Environment configurations
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app
CMD ["node", "backend/dist/index.js"]
