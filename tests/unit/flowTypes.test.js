/**
 * index.js exports Flow types from types.js for Flow-typed apps, while
 * index.d.ts is the declaration TypeScript reads. The two drifted after 1.0:
 * the Flow config had no `transform`, `android` or `ios`, and `state` was a
 * number where native sends a string. This parses both and compares the shapes
 * of the types they share: the same keys, the same optionality, and the same
 * primitive, array, reference and object types.
 */
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const typescript = join(root, 'node_modules', 'typescript', 'package.json');

// The types both files declare under the same name.
const SHARED = [
    'ReactNativeBlobUtilConfig',
    'ReactNativeBlobUtilResponseInfo',
    'ReactNativeBlobUtilStat',
    'AddAndroidDownloads',
    'filedescriptor',
];

function flowKind(annotation) {
    switch (annotation.type) {
        case 'StringTypeAnnotation': return 'string';
        case 'NumberTypeAnnotation': return 'number';
        case 'BooleanTypeAnnotation': return 'boolean';
        case 'ArrayTypeAnnotation': return flowKind(annotation.elementType) + '[]';
        case 'GenericTypeAnnotation':
            return annotation.id.name === 'Array' && annotation.typeParameters
                ? flowKind(annotation.typeParameters.params[0]) + '[]'
                : 'ref:' + annotation.id.name;
        case 'ObjectTypeAnnotation': return 'object';
        case 'UnionTypeAnnotation': return 'union';
        default: return annotation.type;
    }
}

function flowShapes() {
    const parser = require('@babel/parser');
    const ast = parser.parse(readFileSync(join(root, 'types.js'), 'utf8'), {sourceType: 'module', plugins: ['flow']});
    const shapes = {};
    for (const node of ast.program.body) {
        const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
        if (declaration && declaration.type === 'TypeAlias' && declaration.right.type === 'ObjectTypeAnnotation') {
            shapes[declaration.id.name] = Object.fromEntries(declaration.right.properties
                .filter((property) => property.type === 'ObjectTypeProperty')
                .map((property) => [property.key.name, {optional: Boolean(property.optional), kind: flowKind(property.value)}]));
        }
    }
    return shapes;
}

function tsKind(ts, type, source) {
    switch (type.kind) {
        case ts.SyntaxKind.StringKeyword: return 'string';
        case ts.SyntaxKind.NumberKeyword: return 'number';
        case ts.SyntaxKind.BooleanKeyword: return 'boolean';
        case ts.SyntaxKind.ArrayType: return tsKind(ts, type.elementType, source) + '[]';
        case ts.SyntaxKind.TypeReference: return 'ref:' + type.typeName.getText(source);
        case ts.SyntaxKind.TypeLiteral: return 'object';
        case ts.SyntaxKind.UnionType: return 'union';
        default: return ts.SyntaxKind[type.kind];
    }
}

function tsShapes() {
    const ts = require('typescript');
    const source = ts.createSourceFile('index.d.ts', readFileSync(join(root, 'index.d.ts'), 'utf8'), ts.ScriptTarget.ES2020, true);
    const shapes = {};
    ts.forEachChild(source, (node) => {
        if (ts.isInterfaceDeclaration(node)) {
            shapes[node.name.text] = Object.fromEntries(node.members
                .filter(ts.isPropertySignature)
                .map((member) => [member.name.getText(source), {optional: Boolean(member.questionToken), kind: tsKind(ts, member.type, source)}]));
        }
    });
    return shapes;
}

test('the Flow types in types.js match the interfaces in index.d.ts', {skip: existsSync(typescript) ? false : 'typescript is not installed'}, () => {
    const flow = flowShapes();
    const dts = tsShapes();
    for (const name of SHARED) {
        assert.ok(flow[name], `types.js does not declare ${name}`);
        assert.ok(dts[name], `index.d.ts does not declare ${name}`);
        assert.deepEqual(flow[name], dts[name], `${name} differs between types.js and index.d.ts`);
    }
});

test('index.js exports the Flow types an app imports', () => {
    const source = readFileSync(join(root, 'index.js'), 'utf8');
    for (const name of ['ReactNativeBlobUtilConfig', 'ReactNativeBlobUtilResponseInfo', 'ReactNativeBlobUtilStream']) {
        assert.match(source, new RegExp(`export type \\{[^}]*\\b${name}\\b[^}]*\\} from './types'`), `${name} is not exported from index.js`);
    }
});
