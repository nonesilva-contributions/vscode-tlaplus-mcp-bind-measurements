import dns from 'node:dns';
import net from 'node:net';
import os from 'node:os';
import { close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, onWindows, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('07')) {
        return;
    }
    // Node's client looks up the name with ADDRCONFIG, which drops ::1 when IPv6 is only on loopback.
    // lib/net.js adds ADDRCONFIG only outside Windows, so there the client gets ::1 too.
    header('07', 'the URL of a localhost bind: dial the name, then the bound address');
    const outsideIPv6 = Object.values(os.networkInterfaces()).flat().some((a) => !a.internal && a.family === 'IPv6');
    record('use case 07 an IPv6 address outside loopback', outsideIPv6 ? 'yes' : 'no', onWindows ? 'yes' : 'no');
    record('use case 07 the resolver order of Node', dns.getDefaultResultOrder(), 'verbatim');
    record('use case 07 autoSelectFamily of Node', String(net.getDefaultAutoSelectFamily()), 'true');
    const lookup = await dns.promises.lookup('localhost', { all: true, hints: onWindows ? 0 : dns.ADDRCONFIG });
    const looked = lookup.map((n) => n.address).join(', ');
    record('use case 07 the lookup of localhost with the flags of the client', looked,
        onWindows ? '::1, 127.0.0.1' : '127.0.0.1, 127.0.0.1');
    out(`  -> the client lookup of localhost: ${looked}\n`);
    const srv = await listen(makeApp(), 'localhost');
    const { address, port } = srv.address();
    record('use case 07 app.listen(port, "localhost") binds', address, '::1');
    out(`  -> app.listen(port, "localhost") binds ${address}:<port>\n`);
    let answer = await probe('use case 07 a client that dials the name localhost', onWindows ? 'HTTP 200' : 'ECONNREFUSED',
        'localhost', port);
    out(`  -> POST initialize to http://localhost:<port> -> ${show(answer)}\n`);
    answer = await probe('use case 07 a client that dials the bound address', 'HTTP 200', address, port);
    out(`  -> POST initialize to the bound address ${address} -> ${show(answer)}\n`);
    await close(srv);
    // The shipped bind, app.listen(port) with no host, and the name of its URL.
    const shipped = await listen(makeApp(), undefined);
    const bound = shipped.address();
    record('use case 07 app.listen(port), with no host, binds', bound.address, '::');
    answer = await probe('use case 07 with that bind, a client that dials the name localhost', 'HTTP 200', 'localhost',
        bound.port);
    out(`  -> app.listen(port) binds ${bound.address}; POST initialize to http://localhost:<port> -> ${show(answer)}\n`);
    await close(shipped);
    summary();
}

run().catch(fail);
