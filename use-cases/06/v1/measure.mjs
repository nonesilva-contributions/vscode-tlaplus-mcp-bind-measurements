import { close, listen, makeApp } from '../lib/server.mjs';
import { bridgeAddress, fail, header, out, probe, record, requireIsolation, show, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('06')) {
        return;
    }
    const eth = bridgeAddress();
    if (!eth) {
        return;
    }
    // A setting can hold any JSON value, such as a number, and a cleared setting holds the empty string.
    header('06', "a host that is not a non-empty string: app.listen(port, 8080), then app.listen(port, '')",
        ['non-loopback IPv4: <bridge-ip>']);
    const srv = await listen(makeApp(), 8080);
    const { address, port } = srv.address();
    record('use case 06 a number as host binds the unspecified address', address, '::');
    out(`  -> app.listen(port, 8080) binds ${address}:<port>\n`);
    const answer = await probe('use case 06 a number as host answers a request to <bridge-ip> from the same machine', 'HTTP 200', eth, port);
    out(`  -> POST initialize to non-loopback <bridge-ip> -> ${show(answer)}\n`);
    await close(srv);
    // listen() of lib/ skips a host that is falsy, so the empty string goes to app.listen here.
    const empty = await new Promise((resolve) => {
        const s = makeApp().listen(0, '', () => resolve(s));
    });
    const bound = empty.address();
    record('use case 06 an empty string as host binds the unspecified address', bound.address, '::');
    out(`  -> app.listen(port, '') binds ${bound.address}:<port>\n`);
    const reply = await probe('use case 06 an empty string as host answers a request to <bridge-ip> from the same machine', 'HTTP 200', eth, bound.port);
    out(`  -> POST initialize to non-loopback <bridge-ip> -> ${show(reply)}\n`);
    await close(empty);
    summary();
}

run().catch(fail);
