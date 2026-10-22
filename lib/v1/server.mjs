// Reproduces the listen call and the transport options of the startServer
// method of src/lm/MCPServer.ts at commit c869f2a. The tool and resource
// registration of the real getServer is left out.

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export const INIT = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'measure', version: '0' } }
});

export const shippedTransport = () => ({ sessionIdGenerator: undefined });

// MCPServer.ts routes: POST /mcp with no auth and no Host or Origin check
// beyond the transport options, GET and DELETE answering 405.
// transportOptions is late-bound, so options can name the bound port.
export function makeApp(transportOptions = shippedTransport) {
    const app = express();
    app.use(express.json());
    const methodNotAllowed = (req, res) => res.status(405).json({
        jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null
    });
    app.post('/mcp', async (req, res) => {
        try {
            const server = new McpServer(
                { name: 'TLA+ MCP Tools', version: '1.0.0' },
                { capabilities: { resources: {}, logging: {} } }
            );
            const transport = new StreamableHTTPServerTransport(transportOptions());
            res.on('close', () => { transport.close(); server.close().catch(() => {}); });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            if (!res.headersSent) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null });
            }
        }
    });
    app.get('/mcp', methodNotAllowed);
    app.delete('/mcp', methodNotAllowed);
    return app;
}

export function listen(app, host) {
    return new Promise((resolve) => {
        const srv = host ? app.listen(0, host, () => resolve(srv)) : app.listen(0, () => resolve(srv));
    });
}

export function bindAlso(server, port, host) {
    return new Promise((resolve) => {
        server.once('error', (e) => resolve(e.code));
        server.listen(port, host, () => resolve('listening'));
    });
}

export function close(server) {
    return new Promise((resolve) => server.close(resolve));
}
