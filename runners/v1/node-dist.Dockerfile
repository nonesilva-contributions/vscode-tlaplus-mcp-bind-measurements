# The Node builds that the Windows and Ubuntu machines get, downloaded once from nodejs.org and checked
# against the SHASUMS256.txt of each release. ARCHIVE is win-x64.zip or linux-x64.tar.xz, and VERSIONS
# names the Node versions, such as "v20.20.2 v22.23.3"; the runner that builds the image passes both.
ARG BASE
FROM ${BASE}
ARG ARCHIVE
ARG VERSIONS
WORKDIR /dist
RUN [ -n "$ARCHIVE" ] && [ -n "$VERSIONS" ] \
  && for v in $VERSIONS; do mkdir "$v"; done \
  && node -e 'const fs = require("node:fs"); (async () => { for (const v of process.argv[1].split(" ")) { for (const name of ["SHASUMS256.txt", `node-${v}-${process.argv[2]}`]) { const res = await fetch(`https://nodejs.org/dist/${v}/${name}`); if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`); fs.writeFileSync(`${v}/${name}`, Buffer.from(await res.arrayBuffer())); } } })().catch((e) => { console.error(String(e)); process.exitCode = 1; });' "$VERSIONS" "$ARCHIVE" \
  && for v in $VERSIONS; do (cd "$v" && grep "  node-$v-$ARCHIVE\$" SHASUMS256.txt | sha256sum -c -); done
