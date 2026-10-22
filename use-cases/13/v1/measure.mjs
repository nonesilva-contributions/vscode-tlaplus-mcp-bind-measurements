import http from 'node:http';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { INIT, close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, record, requireIsolation, sendRaw, show, summary } from '../lib/measure.mjs';

// 64 KiB at a time, so building the body never holds its inflated size.
async function compressZeros(compressor, size) {
    const zeros = Buffer.alloc(64 * 1024);
    const parts = [];
    compressor.on('data', (c) => parts.push(c));
    const ended = once(compressor, 'end');
    for (let n = 0; n < size; n += zeros.length) {
        if (!compressor.write(zeros)) {
            await once(compressor, 'drain');
        }
    }
    compressor.end();
    await ended;
    return Buffer.concat(parts);
}

// One POST to /mcp, with the text of the answer. The 800 ms timeout is a bound, not a wait.
function pageOf(port, headers, body) {
    return new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers }, (res) => {
            const parts = [];
            res.on('data', (c) => parts.push(c));
            res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(parts).toString('utf8') }));
        });
        req.on('error', (e) => resolve({ error: e.code || String(e), text: '' }));
        req.setTimeout(800, () => req.destroy(new Error('no answer in 800 ms')));
        req.end(body);
    });
}

async function run() {
    if (!requireIsolation('13')) {
        return;
    }
    header('13', 'input limits from the defaults of express.json() and of the Node http server');
    const srv = await listen(makeApp(), '127.0.0.1');
    const { port } = srv.address();
    const jsonHeaders = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
    const stacks = [];
    const consoleError = console.error;
    // Express prints the stack of each rejected body on stderr, which the runner would save with the results.
    console.error = (...args) => stacks.push(args);
    let answer;
    try {
        // https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#limit
        for (const [length, at, expected] of [[102400, 'at the limit', 'HTTP 200'], [102401, 'one byte over the limit', 'HTTP 413']]) {
            // Trailing spaces are JSON whitespace, so the padded body is still the same initialize message.
            const body = Buffer.from(INIT + ' '.repeat(length - Buffer.byteLength(INIT)));
            record(`use case 13 the length of the body ${at}`, body.length, length);
            answer = await sendRaw('127.0.0.1', port, { headers: { ...jsonHeaders, 'Content-Length': body.length }, body });
            record(`use case 13 a body ${at}`, show(answer), expected);
            out(`  -> POST initialize padded with spaces to ${body.length} bytes -> ${show(answer)}\n`);
        }

        // The page of a 413. With NODE_ENV unset, Express writes the error into it.
        const over = Buffer.from(INIT + ' '.repeat(102401 - Buffer.byteLength(INIT)));
        const page = await pageOf(port, { ...jsonHeaders, 'Content-Length': over.length }, over);
        const names = page.text.includes('PayloadTooLargeError') ? 'yes' : 'no';
        const frames = /node_modules[\\/]/.test(page.text) ? 'yes' : 'no';
        record('use case 13 the page of a 413 names the class of the error', names, 'yes');
        record('use case 13 the page of a 413 holds a stack frame in node_modules', frames, 'yes');
        out(`  -> the page of a ${show(page)}: names the class of the error ${names}, a stack frame in node_modules ${frames}\n`);

        // https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#request-entity-too-large
        for (const [encoding, compressor, onWire] of [
            ['gzip', () => zlib.createGzip(), 65250],
            ['deflate', () => zlib.createDeflate(), 65238],
            // Quality 4, because the default 11 was over 25 times slower on these zeros in a trial run.
            ['br', () => zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }), 102]
        ]) {
            // 64 MiB, because 256 MiB of zeros gzips to 260934 bytes, over the limit before any inflating.
            const body = await compressZeros(compressor(), 64 * 1024 * 1024);
            record(`use case 13 the ${encoding} body on the wire`, body.length < 102400 ? 'under 102400 bytes' : `${body.length} bytes`,
                'under 102400 bytes');
            record(`use case 13 the length of the ${encoding} body on the wire`, body.length, onWire);
            const peak = process.resourceUsage().maxRSS;
            answer = await sendRaw('127.0.0.1', port,
                { headers: { ...jsonHeaders, 'Content-Encoding': encoding, 'Content-Length': body.length }, body });
            const grew = (process.resourceUsage().maxRSS - peak) / 1024;
            record(`use case 13 a ${encoding} body that inflates to 64 MiB`, show(answer), 'HTTP 413');
            record(`use case 13 maxRSS growth across the ${encoding} request`,
                grew < 8 ? 'below 8 MiB' : `${grew.toFixed(1)} MiB`, 'below 8 MiB');
            out(`  -> ${encoding}, ${body.length} bytes on the wire that inflate to 64 MiB -> ${show(answer)}; `);
            // The growth changes on every run, so the line gives the bound and the output stays the same.
            out(`maxRSS grew ${grew < 8 ? 'below 8 MiB' : `${grew.toFixed(1)} MiB`}\n`);
        }

        // https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#unsupported-content-encoding-bogus
        answer = await sendRaw('127.0.0.1', port, {
            headers: { ...jsonHeaders, 'Content-Encoding': 'compress', 'Content-Length': Buffer.byteLength(INIT) },
            body: Buffer.from(INIT)
        });
        record('use case 13 an encoding the parser does not support, compress', show(answer), 'HTTP 415');
        out(`  -> POST initialize with Content-Encoding compress -> ${show(answer)}\n`);

        // express.json() skips a type it does not match, and the transport then reads the body with its own limit.
        for (const [length, at, expected] of [[4194304, 'at', 'HTTP 200'], [4194305, 'one byte over', 'HTTP 400']]) {
            const body = Buffer.from(INIT + ' '.repeat(length - Buffer.byteLength(INIT)));
            record(`use case 13 the length of the application/json-patch+json body ${at} the 4mb limit`, body.length, length);
            answer = await sendRaw('127.0.0.1', port, {
                headers: { ...jsonHeaders, 'Content-Type': 'application/json-patch+json', 'Content-Length': body.length }, body
            });
            record(`use case 13 application/json-patch+json, ${at} the 4mb limit of the transport`, show(answer), expected);
            out(`  -> POST initialize as application/json-patch+json, padded to ${body.length} bytes -> ${show(answer)}\n`);
        }

        // https://nodejs.org/docs/v22.23.3/api/http.html#httpmaxheadersize
        record('use case 13 http.maxHeaderSize', http.maxHeaderSize, 16384);
        out(`  -> http.maxHeaderSize ${http.maxHeaderSize}\n`);
        // The docs do not say which bytes count, so under counts every byte and over counts one value alone.
        const fixed = { Host: `127.0.0.1:${port}`, Connection: 'close', ...jsonHeaders, 'Content-Length': Buffer.byteLength(INIT) };
        const sectionBytes = (h) => Buffer.byteLength(
            `POST /mcp HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`);
        const under = { ...fixed, 'X-Pad': '' };
        under['X-Pad'] = 'x'.repeat(16383 - sectionBytes(under));
        record('use case 13 the length of the header section, request line to blank line', sectionBytes(under), 16383);
        answer = await sendRaw('127.0.0.1', port, { headers: under, body: Buffer.from(INIT) });
        record(`use case 13 a header section of ${sectionBytes(under)} bytes, request line to blank line`, show(answer), 'HTTP 200');
        out(`  -> POST initialize, header section of ${sectionBytes(under)} bytes, request line to blank line -> ${show(answer)}\n`);
        // https://nodejs.org/docs/v22.23.3/api/http.html#event-clienterror
        answer = await sendRaw('127.0.0.1', port, { headers: { ...fixed, 'X-Pad': 'x'.repeat(16385) }, body: Buffer.from(INIT) });
        record('use case 13 one header value of 16385 bytes', show(answer), 'HTTP 431');
        out(`  -> POST initialize, one header value of 16385 bytes -> ${show(answer)}\n`);

        // https://nodejs.org/docs/v22.23.3/api/http.html#class-httpserver
        const defaults = { requestTimeout: 300000, headersTimeout: 60000, keepAliveTimeout: 5000, maxRequestsPerSocket: 0 };
        for (const [name, expected] of Object.entries(defaults)) {
            record(`use case 13 ${name}, read from the server, not exercised`, srv[name], expected);
        }
        out(`  -> read from the server, not exercised: ${Object.keys(defaults).map((k) => `${k} ${srv[k]}`).join(', ')}\n`);
    } finally {
        console.error = consoleError;
    }
    record('use case 13 process.env.NODE_ENV', process.env.NODE_ENV, undefined);
    out(`  -> process.env.NODE_ENV ${process.env.NODE_ENV}\n`);
    record('use case 13 error stacks that Express printed on stderr', stacks.length, 6);
    out(`  -> Express printed ${stacks.length} error stacks on stderr during this use case, kept out of this output\n`);
    await close(srv);
    summary();
}

run().catch(fail);
