# The system packages of the vscode runs, installed when the image is built, so that the measurement runs without root.
ARG BASE
FROM ${BASE}
# The apt sources of the base name, in a comment, the snapshot.debian.org time the base was built from.
# The packages come from that snapshot, so every build on the same base installs the same versions.
RUN sed -i -E '/^# http:\/\/snapshot\.debian\.org\//{h;d}; /^URIs: /{x;s/^# /URIs: /}; /^Signed-By: /a Check-Valid-Until: no' \
      /etc/apt/sources.list.d/debian.sources \
  && grep -q '^URIs: http://snapshot.debian.org/' /etc/apt/sources.list.d/debian.sources \
  && ! grep -q 'deb.debian.org' /etc/apt/sources.list.d/debian.sources \
  && apt-get update -qq \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git xvfb libgtk-3-0 libnss3 libasound2 libgbm1 \
    libatk-bridge2.0-0 libxshmfence1 libxss1 libsecret-1-0 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
