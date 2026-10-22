# The base of the use cases that use lib v1: a pinned Node and the pinned packages, installed once.
ARG BASE
FROM ${BASE}
WORKDIR /work
COPY package.json package-lock.json ./
# Plain JavaScript with no links and no install scripts, so the same node_modules also runs on Windows.
RUN npm ci --omit=dev --no-bin-links --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.mjs measure.mjs lib/
