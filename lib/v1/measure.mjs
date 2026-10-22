// The parts every use case shares: the client requests, the checks, and the
// layout of the output. One process runs one use case, so the checks belong
// to that use case alone. The runners copy this folder to lib/, next to the
// case/ folder of the use case, so a use case imports it as ../lib/.

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { INIT } from './server.mjs';

const checks = [];
const BAR = '============================================================';

export const onWindows = process.platform === 'win32';
export const out = (s) => process.stdout.write(s);

export function record(label, got, expected) {
    checks.push({ label, got, expected, ok: got === expected });
    return got;
}

// node_modules sits next to lib/ in every runner.
function version(pkg) {
    const path = new URL(`../node_modules/${pkg}/package.json`, import.meta.url);
    return JSON.parse(fs.readFileSync(path, 'utf8')).version;
}

export function refuse(reason) {
    process.stderr.write(`refusing to run: ${reason}\n`);
    process.exitCode = 2;
}

export function fail(error) {
    console.error(error);
    process.exitCode = 1;
}

export function requireContainer(id) {
    if (fs.existsSync('/.dockerenv')) {
        return true;
    }
    refuse(`use case ${id} runs only in a container`);
    return false;
}

// runners/v1/windows.ps1 sets MCP_BIND_ISOLATED=1 in a Windows machine with no route out.
export function requireIsolation(id) {
    if (fs.existsSync('/.dockerenv') || process.env.MCP_BIND_ISOLATED === '1') {
        return true;
    }
    refuse(`use case ${id} runs only in a container or in a machine with no route out`);
    return false;
}

export function bridgeAddress() {
    for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
            if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('127.')) {
                return a.address;
            }
        }
    }
    refuse('no non-loopback IPv4 address found; run this on the bridge network');
    return null;
}

// Sends one request and resolves on the response headers or the socket error.
// The 800 ms timeout is a bound, not a wait.
export function send(host, port, { method = 'POST', hostHeader, origin, preflight } = {}) {
    return new Promise((resolve) => {
        const headers = { Accept: 'application/json, text/event-stream' };
        if (method === 'POST') {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(INIT);
        }
        if (hostHeader) {
            headers.Host = hostHeader;
        }
        if (origin) {
            headers.Origin = origin;
        }
        if (preflight) {
            headers['Access-Control-Request-Method'] = 'POST';
            headers['Access-Control-Request-Headers'] = 'content-type';
        }
        const req = http.request({ host, port, path: '/mcp', method, headers }, (res) => {
            resolve({ status: res.statusCode, allowOrigin: res.headers['access-control-allow-origin'] });
            res.destroy();
        });
        req.on('error', (e) => resolve({ error: e.code || String(e) }));
        req.setTimeout(800, () => req.destroy(new Error('no answer in 800 ms')));
        if (method === 'POST') {
            req.end(INIT);
        } else {
            req.end();
        }
    });
}

// The 800 ms timeout is a bound, not a wait.
export function sendRaw(host, port, { method = 'POST', headers = {}, body } = {}) {
    return new Promise((resolve) => {
        const req = http.request({ host, port, path: '/mcp', method, headers }, (res) => {
            resolve({ status: res.statusCode });
            res.destroy();
        });
        req.on('error', (e) => resolve({ error: e.code || String(e) }));
        req.setTimeout(800, () => req.destroy(new Error('no answer in 800 ms')));
        req.end(body);
    });
}

export function show(r) {
    if (r.error) {
        return r.error;
    }
    return `HTTP ${r.status}`;
}

export async function probe(label, expected, host, port, opts) {
    const answer = await send(host, port, opts);
    record(label, show(answer), expected);
    return answer;
}

export function header(id, title, notes = []) {
    out(`${BAR}\n`);
    out(` TLA+ extension MCP server -- use case ${id}\n`);
    out(`${BAR}\n`);
    out('environment\n');
    out(`  Node ${process.version}\n`);
    out(`  express ${version('express')}, @modelcontextprotocol/sdk ${version('@modelcontextprotocol/sdk')}\n`);
    for (const note of notes) {
        out(`  ${note}\n`);
    }
    out(`\n## ${title}\n`);
}

export function summary() {
    out(`\n${BAR}\n`);
    out(' SUMMARY, one line per row above\n');
    for (const c of checks) {
        out(c.ok ? ` as expected  ${c.label}: ${c.got}\n` : ` MISMATCH     ${c.label}: ${c.got}, expected ${c.expected}\n`);
    }
    out(`${BAR}\n`);
    if (checks.some((c) => !c.ok)) {
        process.exitCode = 1;
        out('\nMISMATCH\n');
        return;
    }
    out('\ndone\n');
}
