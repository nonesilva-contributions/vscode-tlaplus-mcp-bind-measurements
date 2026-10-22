import { INIT, close, listen, makeApp } from '../lib/server.mjs';
import { bridgeAddress, fail, header, out, probe, record, requireIsolation, sendRaw, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('01')) {
        return;
    }
    const eth = bridgeAddress();
    if (!eth) {
        return;
    }
    header('01', 'a reproduction of the shipped server: transport {sessionIdGenerator: undefined}, app.listen(port) with no host',
        ['non-loopback IPv4: <bridge-ip>']);
    const srv = await listen(makeApp(), undefined);
    const { address, port, family } = srv.address();
    record('use case 01 binds the unspecified address', address, '::');
    out(`  -> bind ${address}:<port> (${family})\n`);
    let answer = await probe('use case 01 answers a request to <bridge-ip> from the same machine', 'HTTP 200', eth, port);
    out(`  -> POST initialize to non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('use case 01 answers a foreign Host and Origin', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: 'attacker.example', origin: 'http://attacker.example' });
    out(`  -> POST initialize Host and Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('use case 01 answers on IPv6 loopback', 'HTTP 200', '::1', port);
    out(`  -> POST initialize to IPv6 loopback ::1 -> ${show(answer)}\n`);
    answer = await probe('use case 01 answers an OPTIONS with the headers of a preflight', 'HTTP 200', '127.0.0.1', port,
        { method: 'OPTIONS', origin: 'http://attacker.example', preflight: true });
    record('use case 01 sends no Access-Control-Allow-Origin', answer.allowOrigin ?? 'absent', 'absent');
    out(`  -> OPTIONS preflight with Origin attacker.example -> ${show(answer)}, `);
    out(`Access-Control-Allow-Origin: ${answer.allowOrigin ?? 'absent'}\n`);
    // https://fetch.spec.whatwg.org/#cors-safelisted-request-header: a browser sends this POST with no preflight,
    // because the essence of the Content-Type is text/plain and the Accept has no unsafe byte.
    answer = await sendRaw('127.0.0.1', port, {
        headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'text/plain; x=application/json',
            Origin: 'http://attacker.example',
            'Content-Length': Buffer.byteLength(INIT)
        },
        body: Buffer.from(INIT)
    });
    record('use case 01 a POST with headers that need no preflight', show(answer), 'HTTP 400');
    out(`  -> POST initialize as text/plain; x=application/json, Origin attacker.example -> ${show(answer)}\n`);
    await close(srv);
    summary();
}

run().catch(fail);
