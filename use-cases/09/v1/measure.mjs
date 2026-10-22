import os from 'node:os';
import { close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, probe, record, refuse, requireContainer, show, summary } from '../lib/measure.mjs';

// A client of a bind to :: may dial ::1, which fails when loopback has no IPv6.
async function run() {
    if (!requireContainer('09')) {
        return;
    }
    const loopback = Object.values(os.networkInterfaces()).flat().filter((a) => a.internal);
    if (!loopback.length || loopback.some((a) => a.family === 'IPv6')) {
        refuse('use case 09 needs a loopback with no IPv6 address');
        return;
    }
    record('use case 09 the loopback lists', loopback.map((a) => a.address).join(', '), '127.0.0.1');
    header('09', 'a bind to "::" when loopback has no IPv6: dial [::1], then 127.0.0.1', ['loopback lists no IPv6 address']);
    const srv = await listen(makeApp(), '::');
    const { address, port } = srv.address();
    record('use case 09 binds the unspecified address', address, '::');
    out(`  -> app.listen(port, "::") binds ${address}:<port>\n`);
    let answer = await probe('use case 09 a client that dials ::1', 'EADDRNOTAVAIL', '::1', port);
    out(`  -> POST initialize to ::1 -> ${show(answer)}\n`);
    answer = await probe('use case 09 a client that dials 127.0.0.1', 'HTTP 200', '127.0.0.1', port);
    out(`  -> POST initialize to 127.0.0.1 -> ${show(answer)}\n`);
    await close(srv);
    // The shipped bind, app.listen(port) with no host, and the name of its URL.
    const shipped = await listen(makeApp(), undefined);
    const bound = shipped.address();
    record('use case 09 app.listen(port), with no host, binds', bound.address, '::');
    answer = await probe('use case 09 with that bind, a client that dials the name localhost', 'HTTP 200', 'localhost',
        bound.port);
    out(`  -> app.listen(port) binds ${bound.address}; POST initialize to http://localhost:<port> -> ${show(answer)}\n`);
    await close(shipped);
    summary();
}

run().catch(fail);
