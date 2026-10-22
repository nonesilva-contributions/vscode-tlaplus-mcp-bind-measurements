// Compares two versions of the extension by their syntax trees, on the path of the host setting: for each
// function, its parameters, conditions and variables, the properties and calls that name the host, the bind,
// the loopback or the URL, and its returns. Usage: node ast-diff.mjs <dir> <dir>
import fs from 'node:fs';
import ts from 'typescript';

const [before, after] = process.argv.slice(2);
const FILES = ['src/main.ts', 'src/lm/MCPServer.ts'];
const NAMES = /host|listen|address|loopback|startServer|constructor|activate|provideMcpServerDefinitions|url/i;
const BODY = /host|listen|address|url/i;
const CALLS = /listen|address|host|bind|advertised|url|loopback|interfaces|startServer|showErrorMessage/i;
const PROPERTIES = /url|host|address|port/i;
// A longer text prints as …, so that a callback or an object literal does not fill the diff.
const SHORT = 160;

// The callee without its arguments, so that a call chain prints as app.listen(…).on.
function calleeName(expr) {
    if (ts.isIdentifier(expr) || expr.kind === ts.SyntaxKind.ThisKeyword) return expr.getText();
    if (ts.isPropertyAccessExpression(expr)) return `${calleeName(expr.expression)}.${expr.name.text}`;
    if (ts.isCallExpression(expr)) return `${calleeName(expr.expression)}(…)`;
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return calleeName(expr.expression);
    return expr.getText().replace(/\s+/g, ' ').slice(0, 40);
}

function nameOf(node) {
    if (ts.isConstructorDeclaration(node)) return 'constructor';
    if (node.name && ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const p = node.parent;
        if (p && ts.isCallExpression(p)) return `callback of ${calleeName(p.expression)}`;
        if (p && ts.isVariableDeclaration(p)) return p.name.getText();
    }
    return null;
}

function outline(path, file) {
    const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const functions = new Map();
    const text = (n) => n.getText().replace(/\s+/g, ' ');
    const short = (n) => (text(n).length <= SHORT ? text(n) : '…');
    const visit = (node, owner) => {
        let current = owner;
        if (ts.isFunctionLike(node) && node.body) {
            const name = nameOf(node);
            if (name) {
                current = { fn: node, params: [], conditions: [], variables: [], properties: [], calls: [], returns: [] };
                functions.set(`${file} ${name}`, current);
            }
        }
        if (current) {
            if (ts.isParameter(node) && node.parent === current.fn) current.params.push(text(node));
            if (ts.isIfStatement(node)) current.conditions.push(`if ${text(node.expression)}`);
            if (ts.isConditionalExpression(node)) current.conditions.push(`${text(node.condition)} ?`);
            // A || inside an if or inside another || is already part of that condition.
            const p = node.parent;
            const inside = p && (ts.isIfStatement(p)
                || (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.BarBarToken));
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken && !inside) {
                current.conditions.push(text(node));
            }
            if (ts.isVariableDeclaration(node) && node.initializer) {
                current.variables.push(`${text(node.name)} = ${short(node.initializer)}`);
            }
            if (ts.isPropertyAssignment(node) && PROPERTIES.test(node.name.getText())) {
                current.properties.push(`${text(node.name)}: ${short(node.initializer)}`);
            }
            if (ts.isCallExpression(node)) {
                current.calls.push(`${calleeName(node.expression)}(${node.arguments.map(short).join(', ')})`);
            }
            if (ts.isReturnStatement(node)) current.returns.push(node.expression ? `return ${text(node.expression)}` : 'return');
        }
        ts.forEachChild(node, (child) => visit(child, current));
    };
    visit(source, null);
    return functions;
}

function lines(f) {
    const unique = (list) => [...new Set(list)];
    return [
        ...unique(f.params).map((p) => `parameter  ${p}`),
        ...unique(f.conditions).map((c) => `condition  ${c}`),
        ...unique(f.variables).map((v) => `variable   ${v}`),
        ...unique(f.properties).map((p) => `property   ${p}`),
        ...unique(f.calls).filter((c) => CALLS.test(c)).map((c) => `call       ${c}`),
        ...unique(f.returns),
    ];
}

// Every function of the files, and the ones on the path of the host setting.
function version(dir) {
    const all = new Map(), path = new Map();
    for (const file of FILES) {
        for (const [key, f] of outline(`${dir}/${file}`, file)) {
            all.set(key, f);
            if (NAMES.test(key) && BODY.test(lines(f).join(' '))) path.set(key, f);
        }
    }
    return { all, path };
}

const [va, vb] = [version(before), version(after)];
const [a, b] = [va.path, vb.path];
// The output is a unified diff, so that GitHub and editors color it; each function is one hunk. A function
// that comes onto the path, or leaves it, is compared with its other version too, so only what changed prints.
const name = (dir) => dir.split('/').pop();
console.log(`--- ${name(before)}`);
console.log(`+++ ${name(after)}`);
for (const key of new Set([...a.keys(), ...b.keys()])) {
    const la = va.all.has(key) ? lines(va.all.get(key)) : [];
    const lb = vb.all.has(key) ? lines(vb.all.get(key)) : [];
    let note = '';
    if (!va.all.has(key)) note = ', new';
    else if (!vb.all.has(key)) note = ', removed';
    else if (!a.has(key)) note = ', now on the path of the host';
    else if (!b.has(key)) note = ', no longer on the path of the host';
    const gone = la.filter((l) => !lb.includes(l)), added = lb.filter((l) => !la.includes(l));
    if (gone.length || added.length) {
        console.log(`\n@@ ${key}${note} @@`);
        gone.forEach((l) => console.log(`-${l}`));
        added.forEach((l) => console.log(`+${l}`));
    }
}
