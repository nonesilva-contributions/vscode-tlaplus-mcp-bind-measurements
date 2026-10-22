import { close, listen, makeApp } from '../lib/server.mjs';
import { fail, header, out, record, requireIsolation, summary } from '../lib/measure.mjs';

async function run() {
    if (!requireIsolation('05')) {
        return;
    }
    // 192.0.2.1 is a documentation address. A machine normally does not have it, so the listen fails.
    header('05', 'a failed listen: app.listen(port, "192.0.2.1", callback), then an error handler');
    const failed = await new Promise((resolve) => {
        const s = makeApp().listen(0, '192.0.2.1', (err) => resolve({ code: err?.code ?? 'no error', address: s.address() }));
    });
    record('use case 05 calls the listen callback with the error', failed.code, 'EADDRNOTAVAIL');
    out(`  -> the callback gets ${failed.code}\n`);
    record('use case 05 address() inside the callback', String(failed.address), 'null');
    out(`  -> address() inside the callback -> ${failed.address}\n`);

    // A callback with no guard against an error: it reads address().address.
    // Express registers it as the first error listener.
    const unguarded = await new Promise((resolve) => {
        const seen = [];
        process.once('uncaughtException', (e) => resolve({ seen, thrown: e.constructor.name, message: e.message }));
        const s = makeApp().listen(0, '192.0.2.1', () => {
            seen.push('callback');
            return s.address().address;
        });
        s.on('error', () => seen.push('error handler'));
    });
    record('use case 05 a callback that reads address().address throws', unguarded.thrown, 'TypeError');
    record('use case 05 the message of that TypeError', unguarded.message, "Cannot read properties of null (reading 'address')");
    record('use case 05 what runs when that callback throws', unguarded.seen.join(', '), 'callback');
    out(`  -> callback reads address().address -> ${unguarded.thrown}; ran: ${unguarded.seen.join(', ')}\n`);

    const guarded = await new Promise((resolve) => {
        const seen = [];
        const s = makeApp().listen(0, '192.0.2.1', (err) => {
            seen.push('callback');
            if (err || !s.address()) {
                return;
            }
        });
        s.on('error', (e) => {
            seen.push('error handler');
            resolve({ seen, code: e.code });
        });
    });
    record('use case 05 with the guard, the error handler runs', `${guarded.seen.join(', ')}: ${guarded.code}`,
        'callback, error handler: EADDRNOTAVAIL');
    out(`  -> callback returns on the error; ran: ${guarded.seen.join(', ')}, with ${guarded.code}\n`);

    // The callback of commit c869f2a, src/lm/MCPServer.ts line 314, on a port that another server holds.
    const holder = await listen(makeApp(), undefined);
    const held = holder.address().port;
    const shipped = await new Promise((resolve) => {
        const seen = [];
        const s = makeApp().listen(held, (err) => {
            const actualPort = s.address()?.port || held;
            seen.push(`callback gets ${err?.code ?? 'no error'}`, `address() ${s.address()}`,
                actualPort === held ? 'builds the URL of the held port' : `builds the URL of port ${actualPort}`);
        });
        s.on('error', (e) => {
            seen.push(`error handler gets ${e.code}`);
            resolve(seen);
        });
    });
    await close(holder);
    record('use case 05 the callback of c869f2a on a held port', shipped.join(', '),
        'callback gets EADDRINUSE, address() null, builds the URL of the held port, error handler gets EADDRINUSE');
    out(`  -> the callback of c869f2a on a held port; ran: ${shipped.join(', ')}\n`);
    summary();
}

run().catch(fail);
