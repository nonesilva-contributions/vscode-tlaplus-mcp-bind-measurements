import { close, listen, makeApp } from '../lib/server.mjs';
import { bridgeAddress, fail, header, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('02')) {
        return;
    }
    const eth = bridgeAddress();
    if (!eth) {
        return;
    }
    header('02', 'a reproduction of the first version of the pull request: app.listen(port, "127.0.0.1"), transport unchanged',
        ['non-loopback IPv4: <bridge-ip>']);
    const srv = await listen(makeApp(), '127.0.0.1');
    const { address, port, family } = srv.address();
    record('use case 02 binds IPv4 loopback', address, '127.0.0.1');
    out(`  -> bind ${address}:<port> (${family})\n`);
    let answer = await probe('use case 02 refuses a request to <bridge-ip> from the same machine', 'ECONNREFUSED', eth, port);
    out(`  -> POST initialize to non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('use case 02 still answers a foreign Host from loopback', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: 'attacker.example', origin: 'http://attacker.example' });
    out(`  -> POST initialize Host and Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('use case 02 refuses IPv6 loopback', 'ECONNREFUSED', '::1', port);
    out(`  -> POST initialize to IPv6 loopback ::1 -> ${show(answer)}\n`);
    await close(srv);
    summary();
}

run().catch(fail);
