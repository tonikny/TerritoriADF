# Expedient de la migració (temporal)

> **Aquest directori és temporal.** Conté les dades reals d'una migració en curs
> (dominis, commits, dates, decisions) i **s'ha d'esborrar abans de fusionar la
> branca a `main`**. Els passos genèrics i el perquè de cada cosa són a
> [`../MIGRATION.md`](../MIGRATION.md); aquí només hi ha la instància concreta.

## Dades de la instància

| Cosa                  | Valor                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Domini en servei      | `hidrants.hopto.org` (DDNS gratuït de No-IP; cal confirmar-lo cada 30 dies)                                                 |
| Domini de destí       | `territoriadf.hopto.org`                                                                                                    |
| Redirect de l'antic   | **No n'hi haurà**: No-IP no permet mantenir-los tots dos, cal cancel·lar l'antic per crear el nou                           |
| Branca                | `60-migracio-nom-aplicacio`                                                                                                 |
| Commit de la migració | `f4fbd59` — «fase 1», 2026-11-04 19:57 +0100                                                                                |
| Commit de rollback    | `796e4e5` (merge del PR #59)                                                                                                |
| Remot                 | `https://github.com/tonikny/hidrants.git` (renombrar més endavant)                                                          |
| Pila antiga           | projecte `hidrants`; contenidors `hidrants-back`, `hidrants-front`, `hidrants-mosquitto`; imatges `hidrants-backend:latest` |
| Pila nova             | projecte `territoriadf`; contenidors `territoriadf-backend`, `territoriadf-frontend`, `territoriadf-mosquitto`              |
| Prefix de backups     | `hidrants_*` → `territoriadf_*`                                                                                             |
| Canvis d'esquema      | cap                                                                                                                         |
| Estat fase 1 (pila)   | **feta i verificada**, encara servint `hidrants.hopto.org`                                                                  |
| Estat fase 2 (domini) | pendent — vegeu `1B-pla-domini.md`                                                                                          |

## Fitxers

- `1A-registre-pila.md` — què es va executar en la fase 1 i com es verifica.
- `1B-pla-domini.md` — pla concret de la fase 2, amb el tall net de domini.

## Recordatoris

- No fusionar res a `main` fins que la fase 2 estigui validada.
- En acabar, `git rm -r docs/migracio` al mateix PR de tancament.
- Si alguna dada d'aquí ha de sobreviure, es generalitza abans a
  `../MIGRATION.md` (sense dominis, URLs ni dates).
