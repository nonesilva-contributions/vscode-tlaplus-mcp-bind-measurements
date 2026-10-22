import dns from 'node:dns';
import http from 'node:http';
import { bindAlso, close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, onWindows, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('12')) {
        return;
    }
    header('12', 'a localhost bind leaves the same port free on the other family');
    record('use case 12 the resolver order of Node', dns.getDefaultResultOrder(), 'verbatim');
    let srv = await listen(makeApp(), 'localhost');
    const { address, port } = srv.address();
    record('use case 12 app.listen(port, "localhost") binds', address, '::1');
    out(`  -> app.listen(port, "localhost") binds ${address}:<port>\n`);
    const other = http.createServer((req, res) => { res.statusCode = 418; res.end(); });
    const otherBind = await bindAlso(other, port, '127.0.0.1');
    record('use case 12 another server binds 127.0.0.1 on the same port', otherBind, 'listening');
    out(`  -> another server on 127.0.0.1:<port> -> ${otherBind}\n`);
    let answer = await probe('use case 12 a client that dials the name localhost', onWindows ? 'HTTP 200' : 'HTTP 418',
        'localhost', port);
    out(`  -> POST initialize to http://localhost:<port> -> ${show(answer)}, `);
    out(`${answer.status === 418 ? 'the other server' : 'the MCP server'}\n`);
    answer = await probe('use case 12 a client that dials the bound address', 'HTTP 200', address, port);
    out(`  -> POST initialize to the bound address ${address} -> ${show(answer)}\n`);
    answer = await probe('use case 12 a client that dials 127.0.0.1', 'HTTP 418', '127.0.0.1', port);
    out(`  -> POST initialize to 127.0.0.1 -> ${show(answer)}, the other server\n`);
    await close(other);
    await close(srv);
    srv = await listen(makeApp(), undefined);
    const shipped = srv.address();
    record('use case 12 the shipped bind, app.listen(port) with no host, binds', shipped.address, '::');
    const shippedOtherServer = http.createServer();
    const shippedOther = await bindAlso(shippedOtherServer, shipped.port, '127.0.0.1');
    // Windows lets the same user bind a specific address on the port of a [::] socket without SO_EXCLUSIVEADDRUSE.
    record('use case 12 with the shipped bind to ::, another server binds 127.0.0.1 on the same port', shippedOther,
        onWindows ? 'listening' : 'EADDRINUSE');
    out(`  -> with the shipped bind to ${shipped.address}, another server on 127.0.0.1 -> ${shippedOther}\n`);
    if (shippedOther === 'listening') {
        await close(shippedOtherServer);
    }
    await close(srv);
    summary();
}

run().catch(fail);
