import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * Fixa la BD temporal d'aquesta execució abans que `env.ts` la llegeixi (per
 * això és el primer import de `vitest.config.ts`).
 *
 * El nom inclou un UUID perquè la CLI, el watcher de l'editor i qualsevol altra
 * execució concurrent no comparteixin fitxer. Un `TEST_DB_PATH` explícit mana
 * (útil per reproduir un cas o per provar el pany de `globalSetup`).
 */
process.env.TEST_DB_PATH ??= path.join(os.tmpdir(), `territoriadf-vitest-run-${randomUUID()}.db`);
