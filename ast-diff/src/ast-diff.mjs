// Compares two versions of the extension by their syntax trees, on the path of the host setting:
// for each function, its conditions, its calls and its returns. Usage: node ast-diff.mjs <dir> <dir>
import fs from 'node:fs';
import ts from 'typescript';

const [before, after] = process.argv.slice(2);
const FILES = ['src/main.ts', 'src/lm/MCPServer.ts'];
const NAMES = /host|listen|address|startServer|constructor|bindHost|advertisedHost|activate|url/i;
const BODY = /host|listen|address/i;

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
    const visit = (node, owner) => {
        let current = owner;
        if (ts.isFunctionLike(node) && node.body) {
            const name = nameOf(node);
            if (name) {
                current = { conditions: [], calls: [], returns: [] };
                functions.set(`${file} ${name}`, current);
            }
        }
        if (current) {
            if (ts.isIfStatement(node)) current.conditions.push(`if ${text(node.expression)}`);
            if (ts.isConditionalExpression(node)) current.conditions.push(`${text(node.condition)} ?`);
            // A || inside an if or inside another || is already part of that condition.
            const p = node.parent;
            const inside = p && (ts.isIfStatement(p)
                || (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.BarBarToken));
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken && !inside) {
                current.conditions.push(text(node));
            }
            if (ts.isCallExpression(node)) {
                const args = node.arguments.map((a) => (text(a).length <= 40 ? text(a) : '…'));
                current.calls.push(`${calleeName(node.expression)}(${args.join(', ')})`);
            }
            if (ts.isReturnStatement(node) && node.expression) current.returns.push(`return ${text(node.expression)}`);
        }
        ts.forEachChild(node, (child) => visit(child, current));
    };
    visit(source, null);
    return functions;
}

function lines(f) {
    const unique = (list) => [...new Set(list)];
    return [
        ...unique(f.conditions).map((c) => `condition  ${c}`),
        ...unique(f.calls).filter((c) => /listen|address|host|bind|advertised|showErrorMessage/i.test(c))
            .map((c) => `call       ${c}`),
        ...unique(f.returns).map((r) => r),
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
// The output is a unified diff, so that GitHub and editors color it; each function is one hunk.
const name = (dir) => dir.split('/').pop();
console.log(`--- ${name(before)}`);
console.log(`+++ ${name(after)}`);
for (const key of new Set([...a.keys(), ...b.keys()])) {
    const la = a.has(key) ? lines(a.get(key)) : null;
    const lb = b.has(key) ? lines(b.get(key)) : null;
    if (!la) {
        console.log(`\n@@ ${key}${va.all.has(key) ? ', now on the path of the host' : ', new'} @@`);
        lb.forEach((l) => console.log(`+${l}`));
        continue;
    }
    if (!lb) {
        console.log(`\n@@ ${key}${vb.all.has(key) ? ', no longer on the path of the host' : ', removed'} @@`);
        la.forEach((l) => console.log(`-${l}`));
        continue;
    }
    const gone = la.filter((l) => !lb.includes(l)), added = lb.filter((l) => !la.includes(l));
    if (gone.length || added.length) {
        console.log(`\n@@ ${key} @@`);
        gone.forEach((l) => console.log(`-${l}`));
        added.forEach((l) => console.log(`+${l}`));
    }
}
