import { close, listen, makeApp } from '../lib/server.mjs';
import { bridgeAddress, fail, header, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('03')) {
        return;
    }
    const eth = bridgeAddress();
    if (!eth) {
        return;
    }
    header('03', 'a bind to 127.0.0.1 with Host checks: app.listen(port, "127.0.0.1") plus ' +
        '{enableDnsRebindingProtection: true, allowedHosts, allowedOrigins: []}', ['non-loopback IPv4: <bridge-ip>']);
    let boundPort = 0;
    const app = makeApp(() => {
        if (!boundPort) {
            throw new Error('allowed hosts built before listen');
        }
        return {
            sessionIdGenerator: undefined,
            enableDnsRebindingProtection: true,
            allowedHosts: [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`],
            allowedOrigins: []
        };
    });
    const srv = await listen(app, '127.0.0.1');
    const { address, port, family } = srv.address();
    boundPort = port;
    record('use case 03 binds IPv4 loopback', address, '127.0.0.1');
    out(`  -> bind ${address}:<port> (${family})\n`);
    let answer = await probe('use case 03 refuses a request to <bridge-ip> from the same machine', 'ECONNREFUSED', eth, port);
    out(`  -> POST initialize to non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('use case 03 refuses a foreign Host with no Origin', 'HTTP 403', '127.0.0.1', port,
        { hostHeader: 'attacker.example' });
    out(`  -> POST initialize Host attacker.example, no Origin -> ${show(answer)}\n`);
    answer = await probe('use case 03 answers a foreign Origin with an allowed Host, allowedOrigins []', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: `127.0.0.1:${port}`, origin: 'http://attacker.example' });
    out(`  -> POST initialize Host 127.0.0.1:<port>, Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('use case 03 answers the Host localhost with the port', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: `localhost:${port}` });
    out(`  -> POST initialize Host localhost:<port> -> ${show(answer)}\n`);
    await close(srv);
    // The control: the same bind with the shipped transport, which turns on no Host check.
    const shipped = await listen(makeApp(), '127.0.0.1');
    answer = await probe('use case 03 with the shipped transport, answers a foreign Host', 'HTTP 200', '127.0.0.1',
        shipped.address().port, { hostHeader: 'attacker.example' });
    out(`  -> shipped transport, POST initialize Host attacker.example -> ${show(answer)}\n`);
    await close(shipped);
    summary();
}

run().catch(fail);
