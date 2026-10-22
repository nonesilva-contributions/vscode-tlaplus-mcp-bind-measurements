import dns from 'node:dns';
import { close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('04')) {
        return;
    }
    header('04', 'a bind to localhost: app.listen(port, "localhost"), transport unchanged');
    const names = await dns.promises.lookup('localhost', { all: true });
    const resolved = names.map((n) => n.address).join(', ');
    record('use case 04 a lookup of localhost with no hints, as listen makes it', resolved, '::1, 127.0.0.1');
    record('use case 04 the resolver order of Node', dns.getDefaultResultOrder(), 'verbatim');
    out(`  -> the resolver order of Node: ${dns.getDefaultResultOrder()}\n`);
    out(`  -> localhost resolves to: ${resolved}\n`);
    const srv = await listen(makeApp(), 'localhost');
    const { address, port, family } = srv.address();
    record('use case 04 binds one family only, the first the resolver gives', address, names[0].address);
    record('use case 04 the family of the bind', family, 'IPv6');
    out(`  -> bind ${address}:<port> (${family})\n`);
    let answer = await probe('use case 04 refuses a request to 127.0.0.1', 'ECONNREFUSED', '127.0.0.1', port);
    out(`  -> POST initialize to 127.0.0.1 -> ${show(answer)}\n`);
    answer = await probe('use case 04 answers on IPv6 loopback', 'HTTP 200', '::1', port);
    out(`  -> POST initialize to ::1 -> ${show(answer)}\n`);
    await close(srv);
    summary();
}

run().catch(fail);
