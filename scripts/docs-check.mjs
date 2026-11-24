#!/usr/bin/env node
/**
 * docs:check — comprova que la documentació versionada no menteixi.
 *
 * Comprova tres coses, que són les que s'han desincronitzat de debò:
 *
 *  1. Els enllaços relatius de Markdown resolen a un fitxer existent.
 *  2. Cada `npm run <script>` i cada `npm test -w <workspace>` cita un script
 *     que existeix al `package.json` corresponent.
 *  3. Cada camí entre cometes invertides amb `/` i extensió de fitxer existeix
 *     (s'ignoren els globs, les rutes amb `<...>`, les URLs i els directoris).
 *
 * No comprova rutes d'API, noms de funcions ni textos: això és feina dels tests.
 * Els camins de `local-doc/` queden fora: és un altre repositori (privat) que no
 * viatja amb aquest, i la documentació el cita a propòsit.
 *
 * Ús: `npm run docs:check`.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Fitxers de documentació del repositori de codi (local-doc és un altre repo). */
const DOCS = ["README.md"];
const DOCS_DIRS = ["docs"];

const EXTENSIONS =
  /\.(ts|tsx|js|mjs|cjs|jsx|json|md|sql|sh|yml|yaml|css|html|py|conf|example)$/;
/**
 * Resolts sota aquests prefixos si la ruta no existeix des de l'arrel: la
 * documentació cita sovint camins relatius al subsistema (p. ex. `routes/osm.ts`).
 */
const SEARCH_ROOTS = [
  "",
  "back/",
  "back/src/",
  "front/",
  "front/src/",
  "front/src/map/",
  "packages/contracts/",
  "packages/contracts/src/",
];
/** Repositori privat de documentació: no es versiona aquí. */
const SKIP_PATH_PREFIX = "local-doc/";
const SKIP_PATH_CHARS = ["*", "<", ">", "…", "{", "}", "(", ")", "|", " ", "#", "$"];
const NPM_BUILTINS = new Set([
  "install",
  "ci",
  "i",
  "add",
  "remove",
  "audit",
  "update",
  "outdated",
  "exec",
  "publish",
  "link",
  "pack",
  "version",
  "prepare",
]);

const errors = [];

function report(file, line, message) {
  errors.push(`${file}:${line}  ${message}`);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relative) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
  } catch {
    return null;
  }
}

async function collectMarkdown(dir) {
  const absolute = path.join(ROOT, dir);
  if (!(await exists(absolute))) {
    return [];
  }
  const found = [];
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectMarkdown(relative)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(relative);
    }
  }
  return found;
}

/** Comprovació 1: enllaços relatius. */
async function checkLinks(file, text) {
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const [index, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1];
      if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue;
      }
      const withoutAnchor = decodeURIComponent(target.split("#")[0].split("?")[0]);
      if (!withoutAnchor) {
        continue;
      }
      const resolved = path.resolve(ROOT, path.dirname(file), withoutAnchor);
      if (!(await exists(resolved))) {
        report(file, index + 1, `enllaç trencat → ${target}`);
      }
    }
  }
}

/** Comprovació 1b: imatges incrustades amb `<img src="...">`. */
async function checkImages(file, text) {
  const imagePattern = /<img[^>]+src="([^"]+)"/g;
  for (const [index, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(imagePattern)) {
      const target = match[1];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue;
      }
      const resolved = path.resolve(ROOT, path.dirname(file), target);
      if (!(await exists(resolved))) {
        report(file, index + 1, `imatge inexistent → ${target}`);
      }
    }
  }
}

/** Comprovació 2: comandes `npm`. */
function checkCommands(file, text, packages) {
  const commandPattern = /npm\s+(run\s+)?([a-z0-9:_.-]+)(?:\s+-w\s+([a-z0-9/_.-]+))?/gi;
  const { root, workspaces } = packages;
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(commandPattern)) {
      const [, isRun, script, workspace] = match;
      if (!script) {
        continue;
      }
      if (!isRun && !workspace) {
        // `npm ci`, `npm install`... no són scripts del projecte.
        continue;
      }
      if (!isRun && NPM_BUILTINS.has(script.toLowerCase())) {
        continue;
      }
      const manifest = workspace ? workspaces[workspace] : root;
      if (!manifest) {
        report(file, index + 1, `workspace desconegut a «${match[0]}»`);
        continue;
      }
      if (!manifest.scripts || !manifest.scripts[script]) {
        report(file, index + 1, `script inexistent a «${match[0]}»`);
      }
    }
  });
}

/** Comprovació 3: camins de fitxer entre cometes invertides. */
async function checkPaths(file, text) {
  const inlinePattern = /`([^`\n]+)`/g;
  for (const [index, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(inlinePattern)) {
      const token = match[1].trim();
      if (SKIP_PATH_CHARS.some((char) => token.includes(char))) {
        continue;
      }
      if (
        !token.includes("/") ||
        token.startsWith("/") ||
        token.startsWith(SKIP_PATH_PREFIX) ||
        !EXTENSIONS.test(token) ||
        /^[a-z][a-z0-9+.-]*:/i.test(token)
      ) {
        continue;
      }
      let found = false;
      for (const prefix of SEARCH_ROOTS) {
        if (await exists(path.join(ROOT, prefix + token.replace(/^\.?\//, "")))) {
          found = true;
          break;
        }
      }
      if (!found) {
        report(file, index + 1, `fitxer inexistent → ${token}`);
      }
    }
  }
}

async function main() {
  const root = await readJson("package.json");
  if (!root) {
    console.error("docs:check: no s'ha pogut llegir package.json");
    process.exit(1);
  }
  const workspaces = {};
  for (const workspace of root.workspaces ?? []) {
    const manifest = await readJson(path.posix.join(workspace, "package.json"));
    if (manifest) {
      workspaces[workspace] = manifest;
    }
  }

  const files = [...DOCS];
  for (const dir of DOCS_DIRS) {
    files.push(...(await collectMarkdown(dir)));
  }

  let checked = 0;
  for (const file of files) {
    let text;
    try {
      text = await readFile(path.join(ROOT, file), "utf8");
    } catch {
      // AGENTS.md és un symlink a la documentació privada: en un clon sense
      // local-doc no es pot llegir i no és un error del repositori de codi.
      continue;
    }
    checked++;
    await checkLinks(file, text);
    await checkImages(file, text);
    checkCommands(file, text, { root, workspaces });
    await checkPaths(file, text);
  }

  if (errors.length > 0) {
    console.error(`docs:check: ${errors.length} problema(es) a ${checked} fitxers\n`);
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `docs:check: ${checked} fitxers correctes (enllaços, imatges, comandes i camins).`,
  );
}

await main();
