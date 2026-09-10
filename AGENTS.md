# Working on this repo

Notes for AI coding agents. Humans are welcome to read them too, but
`CONTRIBUTING.md` is the entry point for contributors.

## Attribution

**Never add AI attribution to commits.** No `Co-Authored-By:` naming an AI, no
`Generated with ...` footers, no session links, no tool name in the message
body. Commits are authored by the maintainer. The same applies to PR
descriptions and to comments posted on issues and pull requests.

If a trailer slips in, it has to be stripped by rewriting history and
force-pushing, which is disruptive on a published branch — so get it right the
first time.

A contributor's own commit is theirs. If a PR arrives carrying an
`AI-Co-Authored-By` trailer the contributor wrote themselves, leave it alone;
that is their authorship record, not ours.

## Tests

Two rules, both non-negotiable:

1. **Run the tests after every change.** `npm test` must pass before you
   hand work back or commit it. Report the result honestly — if something
   fails, say so and show the output rather than describing the change as done.
2. **Every bug fix and every new feature ships with a test.** A fix without a
   regression test is not finished. The test should fail against the old
   behaviour and pass against the new one — say so explicitly, and prove it by
   reverting the fix and watching the test fail.

```sh
npm test          # unit tests (node --test), requires Node >= 22
npm run e2e:all   # appium e2e; android / ios / windows variants exist
```

Unit tests live in `tests/unit/*.test.js` and use Node's built-in runner — no
jest, no babel, no new dependencies. That constrains what is testable: the
package source is Flow-annotated ESM that plain Node cannot parse, so testable
logic belongs in small dependency-free helpers under `utils/`, which the tests
import directly. `utils/byteCount.js` and `tests/unit/byteCount.test.js` are
the pattern to follow.

Where a runtime test genuinely is not reachable — anything needing a booted
app, a device, or the native layer — say so plainly instead of claiming
coverage you do not have, and describe what you verified statically instead.

CI does not run the unit tests yet; the e2e workflow pins Node 20. Do not treat
a green CI run as evidence that `npm test` passes.

## Linting and style

**`npx eslint` currently fails repo-wide.** `.eslintrc.json` extends
`@react-native`, and `@react-native/eslint-config` is not in
`devDependencies`, so ESLint aborts before checking anything. There is no
`lint` script either. Installing that one package would revive the config —
worth doing, but until then nothing style-checks the JS and you cannot lint
your own work.

The rules in `.eslintrc.json` still describe the intended style, so follow them
by hand. The ones that are errors rather than warnings:

- `eqeqeq` — always `===` / `!==`
- `semi`, `semi-spacing`, `no-extra-semi` — semicolons required
- `no-cond-assign`, `no-irregular-whitespace`

`no-console` and `no-extra-parens` are warnings; `import/order` wants external
imports before internal ones. Beyond that, match the file you are editing:
4-space indent, single quotes.

## Line endings

There is no `.gitattributes` and no `.editorconfig`, and the tree is genuinely
mixed — `index.js` and `android.js` are CRLF, `fetch.js` and `fs.js` are LF.

Never let an editor or script normalise line endings across a file. Rewriting a
whole file to change one line produces a diff nobody can review and buries the
actual change. After editing, check that `git diff --stat` reports roughly the
number of lines you meant to touch; if it reports the whole file, you have
reformatted it and should redo the edit in place.

## Commit messages

Conventional commits with a scope, matching the existing history:

```
fix(android): use float division for download progress ratio
fix(types): allow HEAD in the Methods union
test(progress): cover byte-count normalisation across native payload shapes
chore(release): 0.24.11
```

Explain *why* in the body, not just what — the mechanism of the bug, and why
this fix rather than an obvious alternative. Reference the issue or PR it came
from. These messages are the only changelog this project has.

## Native module access

JS reaches native through `utils/nativeModule.js`, never by importing
`codegenSpecs/NativeBlobUtils` directly. `TurboModuleRegistry.get()` is
nullable and the spec evaluates it once, so importing that binding caches a
possibly-null module for the lifetime of the process.

Nothing may touch native at module scope. A `new NativeEventEmitter(...)` or a
`getConstants()` call at import time crashes a New Architecture cold start
before the app can boot.

## Three platforms

`android/`, `ios/` and `windows/` all implement the same API, and they do not
always agree. A bug at the JS boundary is often a cross-platform inconsistency
rather than a single-platform defect: progress byte counts arrived as strings
from Android and iOS but as int64 (and `null`) from Windows, so the declared
`number` type was wrong everywhere, differently.

Before fixing native code on the platform you can test, check what the other
two do. Windows is the one that gets forgotten.

## Codegen

`codegenSpecs/` is parsed by React Native's codegen; the eager
`TurboModuleRegistry.get<Spec>('ReactNativeBlobUtil')` export must stay exactly
as it is, because that call is how codegen discovers the module. If you change
anything in that directory, diff the generated schema before and after:

```sh
node node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js \
  --platform ios /tmp/schema.json codegenSpecs
```

## Dependencies

Do not add one without a strong reason. The unit tests deliberately use Node's
built-in runner to avoid a test framework, and an unused `glob` dependency was
removed in #480. If a change seems to need a package, say why and let the
maintainer decide.

## Types

`index.d.ts` and `index.js.flow` declare the same public API twice and drift
apart — the Flow copy was missing both `PATCH` and `HEAD` long after the
TypeScript one had `PATCH`. Change both, and check they still agree.

## Releases

`npm publish` runs from the `npm publish` GitHub Action, triggered manually
(`workflow_dispatch`) against `master`. To prepare one:

1. `npm version <x.y.z> --no-git-tag-version` — updates `package.json` and
   `package-lock.json` together, which `npm ci` in the workflow requires.
2. Commit, push, then trigger the workflow.
3. Tag as `0.24.11` — no `v` prefix — and create a GitHub release with an
   empty title and a plain list of what changed.

Fixes sitting unreleased on `master` are worse than no fix: users install from
npm, hit the bug, and file duplicates. A single unreleased Android fix produced
five separate reports of the same crash. Release promptly, and keep an issue
open until the release that fixes it is actually published.
