import dns from 'node:dns';
import http from 'node:http';
import { bindAlso, close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

// The extension host resolves names with the order ipv4first, which puts 127.0.0.1 first for localhost.
async function run() {
    if (!requireIsolation('15')) {
        return;
    }
    dns.setDefaultResultOrder('ipv4first');
    header('15', 'a localhost bind when localhost resolves to 127.0.0.1 first',
        ['resolver order ipv4first, set by this script']);
    record('use case 15 the resolver order of Node', dns.getDefaultResultOrder(), 'ipv4first');
    const names = (await dns.promises.lookup('localhost', { all: true })).map((n) => n.address).join(', ');
    record('use case 15 localhost resolves to', names, '127.0.0.1, ::1');
    out(`  -> localhost resolves to: ${names}\n`);
    const srv = await listen(makeApp(), 'localhost');
    const { address, port, family } = srv.address();
    record('use case 15 binds one family only, the first the resolver gives', address, '127.0.0.1');
    record('use case 15 the family of the bind', family, 'IPv4');
    out(`  -> bind ${address}:<port> (${family})\n`);
    let answer = await probe('use case 15 refuses IPv6 loopback when bound to 127.0.0.1', 'ECONNREFUSED', '::1', port);
    out(`  -> POST initialize to ::1 -> ${show(answer)}\n`);
    answer = await probe('use case 15 answers on IPv4 loopback', 'HTTP 200', '127.0.0.1', port);
    out(`  -> POST initialize to 127.0.0.1 -> ${show(answer)}\n`);
    answer = await probe('use case 15 a client that dials the name localhost', 'HTTP 200', 'localhost', port);
    out(`  -> POST initialize to http://localhost:<port> -> ${show(answer)}\n`);
    const other = http.createServer((req, res) => { res.statusCode = 418; res.end(); });
    const otherBind = await bindAlso(other, port, '::1');
    record('use case 15 another server binds ::1 on the same port', otherBind, 'listening');
    out(`  -> another server on ::1:<port> -> ${otherBind}\n`);
    answer = await probe('use case 15 with the other server, a client that dials the name localhost', 'HTTP 200', 'localhost', port);
    out(`  -> POST initialize to http://localhost:<port> -> ${show(answer)}, `);
    out(`${answer.status === 418 ? 'the other server' : 'the MCP server'}\n`);
    answer = await probe('use case 15 with the other server, a client that dials the bound address', 'HTTP 200', address, port);
    out(`  -> POST initialize to the bound address ${address} -> ${show(answer)}\n`);
    if (otherBind === 'listening') {
        await close(other);
    }
    await close(srv);
    const shipped = await listen(makeApp(), undefined);
    const shippedBound = shipped.address();
    record('use case 15 the shipped bind, app.listen(port) with no host, binds', shippedBound.address, '::');
    const shippedOtherServer = http.createServer();
    const shippedOther = await bindAlso(shippedOtherServer, shippedBound.port, '::1');
    record('use case 15 with the shipped bind to ::, another server binds ::1 on the same port', shippedOther, 'EADDRINUSE');
    out(`  -> with the shipped bind to ${shippedBound.address}, another server on ::1 -> ${shippedOther}\n`);
    if (shippedOther === 'listening') {
        await close(shippedOtherServer);
    }
    await close(shipped);
    summary();
}

run().catch(fail);
