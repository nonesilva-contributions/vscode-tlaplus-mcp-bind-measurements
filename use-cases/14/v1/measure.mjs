import fs from 'node:fs';
import os from 'node:os';
import dns from 'node:dns';
import { close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, probe, record, refuse, show, summary } from '../lib/measure.mjs';

// The default host localhost, and the URL of a wildcard bind, when loopback has no IPv4.
async function run() {
    const interfaces = Object.values(os.networkInterfaces()).flat();
    if (!interfaces.length || !interfaces.every((a) => a.internal && a.family === 'IPv6')) {
        refuse('use case 14 binds every interface, and needs a loopback with no IPv4 as the only interface');
        return;
    }
    header('14', 'binds when loopback has no IPv4: localhost in two resolver orders, 127.0.0.1, ::1, then "::"',
        ['every listed address is an IPv6 loopback address']);
    const hosts = fs.readFileSync('/etc/hosts', 'utf8').split('\n').map((l) => l.trim().split(/\s+/))
        .filter((f) => !f[0].startsWith('#') && f.slice(1).includes('localhost')).map((f) => f.join(' ')).join(' | ');
    record('use case 14 the lines of /etc/hosts that name localhost', hosts, '127.0.0.1 localhost');
    out(`  -> /etc/hosts names localhost on: ${hosts}\n`);
    const bind = (host) => new Promise((resolve) => {
        const srv = makeApp().listen(0, host, (err) => resolve({ srv, bound: err ? err.code : srv.address().address }));
    });
    for (const order of ['verbatim', 'ipv4first']) {
        dns.setDefaultResultOrder(order);
        const names = (await dns.promises.lookup('localhost', { all: true })).map((n) => n.address).join(', ');
        record(`use case 14 with the order ${order}, localhost resolves to`, names, '127.0.0.1');
        out(`  -> with the order ${order}, localhost resolves to: ${names}\n`);
        const { srv, bound } = await bind('localhost');
        record(`use case 14 with the order ${order}, localhost binds`, bound, 'EADDRNOTAVAIL');
        out(`  -> app.listen(port, "localhost") -> ${bound}\n`);
        if (srv.listening) {
            await close(srv);
        }
    }
    const ipv4Bind = await bind('127.0.0.1');
    record('use case 14 a bind to 127.0.0.1', ipv4Bind.bound, 'EADDRNOTAVAIL');
    out(`  -> app.listen(port, "127.0.0.1") -> ${ipv4Bind.bound}\n`);
    if (ipv4Bind.srv.listening) {
        await close(ipv4Bind.srv);
    }
    const ipv6Bind = await bind('::1');
    record('use case 14 a bind to ::1', ipv6Bind.bound, '::1');
    out(`  -> app.listen(port, "::1") -> ${ipv6Bind.bound}\n`);
    if (ipv6Bind.srv.listening) {
        const reached = await probe('use case 14 a client that dials [::1] on the bind to ::1', 'HTTP 200', '::1',
            ipv6Bind.srv.address().port);
        out(`  -> POST initialize to ::1 -> ${show(reached)}\n`);
        await close(ipv6Bind.srv);
    }
    const srv = await listen(makeApp(), '::');
    const { address, port } = srv.address();
    record('use case 14 a wildcard bind', address, '::');
    out(`  -> app.listen(port, "::") binds ${address}:<port>\n`);
    let answer = await probe('use case 14 a client that dials 127.0.0.1', 'ENETUNREACH', '127.0.0.1', port);
    out(`  -> POST initialize to 127.0.0.1 -> ${show(answer)}\n`);
    answer = await probe('use case 14 a client that dials [::1] on the bind to ::', 'HTTP 200', '::1', port);
    out(`  -> POST initialize to ::1 -> ${show(answer)}\n`);
    await close(srv);
    summary();
}

run().catch(fail);
