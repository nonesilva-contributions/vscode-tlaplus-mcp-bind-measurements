# vscode-tlaplus-mcp-bind-measurements

> A `*-measurements` repository measures how open source software behaves, to
choose what to test. Only the behaviors that matter become tests in the pull
request, so the project's repository does not get a lot of unnecessary tests.

This repository supports the pull request
https://github.com/tlaplus/vscode-tlaplus/pull/544.

## Structure

Each version keeps its own copy of everything it used. Old versions are never edited, so every
result still matches the code that produced it.

```text
.
├── ast-diff/
│   ├── INSTALL.md
│   ├── results/
│   │   └── v<N>-<base-commit>.diff
│   └── src/
├── versions/
│   └── v<N>/
│       ├── INSTALL.md
│       ├── report.md
│       ├── results/
│       ├── src/
│       └── v<N>-<NNNN>-*.patch
├── docker.sh
└── measurements.gitconfig
```

## Docs to read

Use the last version, the one with the highest `<N>`.

Main file:
- `versions/v<N>/report.md`

Supporting files:
- `ast-diff/results/v<N>-<base-commit>.diff`
- `versions/v<N>/v<N>-<NNNN>-*.patch`
- `versions/v<N>/INSTALL.md`
