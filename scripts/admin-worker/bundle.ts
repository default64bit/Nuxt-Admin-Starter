import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Builds the admin service worker script from the TypeScript worker modules with the TypeScript compiler already in
// the repository: each module is transpiled to CommonJS and wrapped in a tiny module registry, so no bundler package
// is needed. Relative imports only. Used by the Nitro virtual module (nuxt.config.ts) and by the worker test.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../shared/admin-worker");

export function bundleAdminWorker(entryName = "entry"): string {
  const modules = new Map<string, string>();
  const visit = (id: string): void => {
    if (modules.has(id)) return;
    const output = ts.transpileModule(readFileSync(resolve(ROOT, `${id}.ts`), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, verbatimModuleSyntax: false },
    }).outputText;
    const body = output.replace(/require\("(\.[^"]+)"\)/g, (_match, specifier: string) => {
      const dependency = relative(ROOT, resolve(ROOT, dirname(id), specifier));
      visit(dependency);
      return `__req(${JSON.stringify(dependency)})`;
    });
    modules.set(id, body);
  };
  visit(entryName);
  const table = [...modules].map(([id, body]) => `${JSON.stringify(id)}: function (exports, __req) {\n${body}\n}`);
  return `(function () {
"use strict";
var defs = {${table.join(",\n")}};
var cache = {};
function load(id) {
  if (!cache[id]) { var module = { exports: {} }; cache[id] = module; defs[id](module.exports, load); }
  return cache[id].exports;
}
load(${JSON.stringify(entryName)});
})();
`;
}
