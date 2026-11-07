# Sincronització amb OpenStreetMap (OSM)

## 1. Introducció

La integració amb OpenStreetMap permet mantenir una sincronització bidireccional entre el sistema de gestió de hidrants i la base de dades OSM pública. Aquesta funcionalitat és essencial per als administradors que volen:

- Importar dades existents d'OSM al sistema local
- Exportar nous hidrants i modificacions cap a OSM
- Mantenir la coherència entre ambdues plataformes
- Resoldre discrepàncies i conflictes de manera controlada

La sincronització respecta les dades locals i evita pèrdua d'informació, oferint controls granulars sobre què es sincronitza.

## 2. Configuració requerida

### 2.1. Token OAuth 2.0 d'OSM

Per poder pujar canvis a OSM, cal registrar una aplicació a [OpenStreetMap OAuth2](https://www.openstreetmap.org/oauth2/applications) i obtenir un token. El token necessita el permís `write_api`.

Al formulari de registre, l'**URI de redirecció** és obligatòria: poseu-hi una URL del vostre desplegament (per exemple `https://<domini>/`). Aquí no hi ha flux de callback (el backend fa servir el token directament), però si canvieu de domini actualitzeu-la al registre perquè segueixi coincidint amb l'aplicació.

Afegeu aquesta variable al fitxer `back/.env`:

```bash
OSM_ACCESS_TOKEN=el_teu_token_oauth2_aqui
```

**Nota:** El token no expira i és obligatori per les operacions de push sync (exportació). La importació (pull sync) funciona sense token.

La política d'ús d'Overpass demana un contacte vàlid a la capçalera `User-Agent`. Configura'l amb `OVERPASS_CONTACT` (correu o URL); si no hi és, s'envia només `TerritoriADF/1.0` i Overpass et pot limitar o bloquejar les consultes.

### 2.2. Variables d'entorn opcionals

| Variable           | Descripció                                       | Valor per defecte                         |
| ------------------ | ------------------------------------------------ | ----------------------------------------- |
| `OSM_API_URL`      | URL de l'API d'OSM                               | `https://api.openstreetmap.org/api/0.6`   |
| `OVERPASS_URL`     | URL de l'API d'Overpass                          | `https://overpass-api.de/api/interpreter` |
| `OVERPASS_CONTACT` | Contacte (correu o URL) al User-Agent d'Overpass | — (només `TerritoriADF/1.0`)              |

## 3. Flux de treball principal (prioritzat UI)

### 3.1. Panell de control principal

L'entrada principal a la funcionalitat OSM es troba a través del component `OsmSyncPanel`, accessible als administradors. El panell presenta:

- **Botó principal "Baixar d'OSM"** per iniciar importació
- **Estadístiques globals** de canvis pendents per estat
- **Seccions agrupades** per cada estat de sincronització
- **Controls de selecció** per accions massives

### 3.2. Importació dades d'OSM (Pull Sync)

Per importar hidrants des d'OSM:

1. Fes clic al botó **"Baixar d'OSM"** a la interfície principal
2. El sistema descarrega els hidrants d'OSM mitjançant Overpass API
3. Compara amb l'estat local i aplica les següents regles:
   - Hidrants `SYNCED`: S'actualitzen si OSM té versions més noves
   - Hidrants `PENDING_CREATE`: Es mantenen locals (no es toquen)
   - Hidrants que ja no són a OSM: es marquen `MISSING_IN_OSM` (no s'esborren; es conserven amb les dades locals)
   - Hidrants `PENDING_UPDATE/PENDING_DELETE`: Es marquen com `CONFLICT` si OSM és més nou
   - Altres estats (`CONFLICT`, `ERROR`, `REVIEW`): Es mantenen sense canvis

**Paràmetres disponibles:**

- `force=true`: Sobreescriu tot l'estat local (comportament original)
- `adf=ID`: Especifica quin ADF sincronitzar

### 3.3. Revisió i selecció de canvis pendents

Després de les edicions locals, els hidrants modificats apareixen al panell organitzats per estat:

- **PENDING_CREATE**: Hidrants nous locals per exportar
- **PENDING_UPDATE**: Hidrants modificats localment
- **PENDING_DELETE**: Hidrants marcats per esborrar
- **CONFLICT**: Discrepàncies amb OSM
- **ERROR**: Errors en operacions anteriors
- **REVIEW**: Dades amb warnings de validació

**Accions disponibles:**

- Selecció individual o massiva d'hidrants
- Visualització de diferències locals vs OSM
- Accions específiques per cada hidrant (pujar, baixar, descartar)

### 3.4. Exportació canvis a OSM (Push Sync)

Per exportar canvis pendents:

1. Selecciona els hidrants que vols exportar (individualment o massivament)
2. Fes clic a **"Pujar seleccionats"** o **"Pujar tots"**
3. El sistema valida les dades i puja els canvis a OSM
4. Les operacions es realitzen dins d'un únic changeset
5. Els hidrants processats marquen com `SYNCED`

**Controls addicionals:**

- **"Descartar seleccionats"**: Elimina canvis locals i restaura l'estat anterior
- **"Baixar de OSM"**: Aplica la versió d'OSM a un hidrant específic

## 4. Descripció detallada de la interfície d'usuari

### 4.1. OsmSyncPanel: Panell principal

**Panell superior amb controls:**

- Botó principal **"Baixar d'OSM"** per importació
- Indicador de càrrega durant operacions
- Resum estadístic amb xifres totals per estat

**Seccions de contingut:**
Cada estat té la seva pròpia secció amb:

- **Capçalera amb icona i comptador**
- **Llista d'hidrants** amb informació contextual
- **Controls massius** (seleccionar tot, acció per seleccionats)

**Informació per hidrant:**

- ID i ubicació del hidrant
- Data de darrera modificació
- Enllaç directe al node d'OSM
- Botons d'acció específics segons l'estat

### 4.2. Gestió per hidrant (HydrantSyncActions)

A nivell individual, cada hidrant mostra:

**Indicadors visuals:**

- **Badge de color** indicant l'estat actual
  - Verd: `SYNCED`
  - Blau: `PENDING_*`
  - Taronja: `CONFLICT`
  - Vermell: `ERROR`
  - Groc: `REVIEW`

**Enllaços d'accés:**

- Enllaç directe a OSM per veure el node original
- Botó per veure diferències detallades (vs OSM)

**Botons d'acció contextuals:**

- **Estat PENDING**: Botó "Pujar" per exportar
- **Estat CONFLICT**: Botons "Resoldre", "Reintentar", "Descartar"
- **Estat ERROR**: Botons "Reintentar", "Descartar"
- **Tots els estats**: Botó "Baixar" per actualitzar des d'OSM

**Diferències detallades:**
Comparació visual entre tags locals vs OSM:

- Tags afegits locals (↗️)
- Tags eliminats locals (↘️)
- Tags modificats (↔️)
- Tags en conflicte (⚠️)

## 5. Estats de sincronització

### Taula d'estats

| Estat            | Color | Descripció                  | Accions disponibles                              |
| ---------------- | ----- | --------------------------- | ------------------------------------------------ |
| `SYNCED`         | 🟢    | Sincronitzat amb OSM        | Modificar, baixar, pujar                         |
| `MISSING_IN_OSM` | ⚪    | Ja no és a OSM              | Esborrar de la BD (purga manual)                 |
| `PENDING_CREATE` | 🔵    | Nou hidrant local per crear | Pujar, descartar                                 |
| `PENDING_UPDATE` | 🔵    | Canvi local per pujar       | Pujar, descartar, veure diferències              |
| `PENDING_DELETE` | 🔵    | Marcat per esborrar         | Pujar (esborrar), descartar                      |
| `CONFLICT`       | 🟠    | Conflicte de versió         | Resoldre, reintentar, descartar                  |
| `ERROR`          | 🔴    | Error durant sincronització | Reintentar, descartar                            |
| `REVIEW`         | 🟡    | Dades amb warnings          | Pujar (després de revisió), modificar, descartar |

### Transicions entre estats

**Modificacions locals:**

```
SYNCED → PENDING_CREATE (nou hidrant)
SYNCED → PENDING_UPDATE (modificació)
SYNCED → PENDING_DELETE (marcar per esborrar)
```

**Operacions de sincronització:**

```
PENDING_* → SYNCED (push exitós)
PENDING_* → ERROR (error en push)
PENDING_* → CONFLICT (conflicte detectat)
CONFLICT → SYNCED (resolució exitosa)
ERROR → SYNCED (fixat)
REVIEW → SYNCED (després de pujar)
```

**Pull sync:**

```
SYNCED → CONFLICT (OSM té versions més noves)
SYNCED → SYNCED (OSM té la mateixa versió)
SYNCED → SYNCED (forçat per paràmetre force=true)
```

**Descartament:**

```
PENDING_* → SYNCED o esborrat
CONFLICT → SYNCED (revertit a OSM)
ERROR → SYNCED o esborrat
REVIEW → SYNCED (revertit) o modificat
```

## 6. Casos d'ús principals

### 6.1. Primera importació d'OSM

**Escenari:** Sistema nou sense dades locals, s'importen hidrants existents d'OSM

**Passos:**

1. Administrador accedeix a panell OSM
2. Fes clic **"Baixar d'OSM"**
3. Sistema descarrega hidrants d'OSM per l'àrea de l'ADF
4. Hidrants es marquen com `SYNCED`
5. Els hidrants que ja no són a OSM es marquen `MISSING_IN_OSM` i es conserven localment (la purga és manual)

**Resultat:** Sistema carregat amb hidrants d'OSM, tots en estat `SYNCED`

### 6.2. Edició sincronitzada d'hidrants

**Escenari:** Edició local d'un hidrant existent

**Passos:**

1. Editor modifica dades d'un hidrant (ex: tipus, diàmetre)
2. Sistema automàticament marca hidrant com `PENDING_UPDATE`
3. Editor pot continuar treballant o exportar immediatament
4. Quan es fa push, les dades locals pugen a OSM
5. Hidrant es marca com `SYNCED`

**Resultat:** Canvi reflectit tant a sistema local com a OSM

### 6.3. Resolució de conflictes

**Escenari:** OSM té versions més noves que les dades locals

**Passos:**

1. Sistema detecta conflicte durant pull sync
2. Hidrant marcat com `CONFLICT`
3. Editor visualitza diferències detallades
4. Opcions disponibles:
   - **"Reintentar"**: Manté local i puja
   - **"Baixar"**: Sobreescriu amb OSM
   - **"Exportar OSC"**: Genera fitxer per JOSM
   - **"Descartar"**: Reverteix a OSM

**Resultat:** Conflicte resolt, hidrant sincronitzat

### 6.4. Migració massiva de dades

**Escenari:** Exportació de múltiples canvis pendents

**Passos:**

1. Editor selecciona múltiples hidrants amb estats `PENDING_*`
2. Fes clic **"Pujar seleccionats"**
3. Sistema valida totes les dades seleccionades
4. Realitza un únic changeset amb tots els canvis
5. Hidrants processats marcats com `SYNCED`

**Resultat:** Múltiples canvis exportats de manera eficient

## 7. Solució de conflictes

### 7.1. Tipus de conflictes comuns

**Conflicte de versió (409):**

- OSM té versions més noves que les dades locals
- Resolució automàtica possible quan la ubicació no ha canviat
- Resolució manual necessària quan ubicació ha canviat

**Conflicte de dades:**

- Tags invàlids detectats per la validació
- Resolució: modificar les dades locals per complir amb els estàndards

**Conflicte de permisos:**

- Token OAuth invàlid o sense suficients permisos
- Resolució: actualitzar el token amb scopes adequats

### 7.2. Estratègies de resolució

**Resolució automàtica:**

- Sistema intenta merge automàtic quan la ubicació coincideix
- Tags locals es mantenen si són vàlids
- Notificació via Telegram quan és possible

**Resolució manual:**

- Visualització de diferències detallades
- Selecció manual de quina versió mantenir
- Exportació a JOSM per conflictes complexos

**Fitxers .osc per conflictes:**

- Genera fitxer XML estàndard OSM
- Pot importar-se a JOSM per edició manual
- Conté totes les dades necessàries per resoldre

### 7.3. Ús de JOSM per conflictes complexos

1. Fes clic **"Exportar OSC"** per a un hidrant en conflicte
2. Descarrega fitxer .osc al teu sistema
3. Obre fitxer a JOSM
4. Resol discrepàncies visualment
5. Exporta els canvis a OSM directament des de JOSM
6. Marca l'hidrant com `SYNCED` a la interfície

## 8. Validació de dades

### 8.1. Tags gestionats i valors permesos

| Tag                     | Valors permesos             | Notes                                   |
| ----------------------- | --------------------------- | --------------------------------------- |
| `fire_hydrant:type`     | `pillar`, `underground`     | Tipus de hidrant                        |
| `fire_hydrant:position` | `lane`, `sidewalk`, `green` | Ubicació relativa                       |
| `couplings`             | `1`, `2`, `3`, `4`          | Nombre d'acoblaments                    |
| `couplings:diameters`   | `45`, `70`, `100`           | Altres valors → warning                 |
| `fire_hydrant:pressure` | Qualsevol (número o text)   | Pressió (bar o `yes`, `low`, `high`...) |
| `survey:date`           | Format ISO (YYYY-MM-DD)     | Data de revisió                         |

### 8.2. Validacions generals

**Regles aplicades:**

- Longitud màxima: 255 caràcters per clau i valor
- Tipatge correcte: numèrics, dates, etc.
- No permet tags buits o nuls
- Text majoritàriament en minúscules (warnings per majúscules > 2 caràcters)

**Nivells de validació:**

- **Error:** Dades invàlides → bloqueja pujada, marca com `ERROR`
- **Warning:** Valors no estàndard o format no recomanat → permet pujada, marca com `REVIEW`

### 8.3. Impacte en la sincronització

- **Errors:** Bloquegen l'exportació fins que es corregeixin
- **Warnings:** Permeten l'exportació però marquen per revisió
- **Correcció automàtica:** El sistema intenta corregir errors menors (majúscules, formats)

## 9. Referència tècnica (API)

### 9.1. Endpoints principals

| Endpoint                     | Mètode | Descripció                                    | Paràmetres                                    |
| ---------------------------- | ------ | --------------------------------------------- | --------------------------------------------- |
| `/api/osm/status`            | GET    | Estat del token OSM i comptador de conflictes | -                                             |
| `/api/osm/pending`           | GET    | Llista de canvis pendents per ADF             | `adf` (ID de ADF)                             |
| `/api/osm/push-sync`         | POST   | Pujar tots els canvis pendents                | -                                             |
| `/api/osm/push-selected`     | POST   | Pujar només els hidrants seleccionats         | `ids` (array d'IDs)                           |
| `/api/osm/discard-selected`  | POST   | Descartar/esborrar canvis seleccionats        | `ids` (array d'IDs)                           |
| `/api/osm/conflicts`         | GET    | Llistat de conflictes amb detalls             | `adf` (ID de ADF)                             |
| `/api/osm/conflicts/osc`     | GET    | Descarregar fitxer .osc amb conflictes        | `adf` (ID de ADF)                             |
| `/api/osm/conflicts/resolve` | POST   | Resoldre un conflicte després de JOSM         | `id` (ID hidrant), `changeset` (ID changeset) |
| `/api/osm/reviews`           | GET    | Hidrants amb warnings pendents                | `adf` (ID de ADF)                             |
| `/api/osm/pull-hydrant`      | POST   | Baixar node individual d'OSM                  | `id` (ID hidrant)                             |
| `/api/osm/diff/:id`          | GET    | Diferències local vs OSM                      | `:id` (ID hidrant)                            |

### 9.2. Respostes esperades

**Exemple resposta `/api/osm/pending`:**

```json
{
  "synced": 45,
  "pending_create": 2,
  "pending_update": 3,
  "pending_delete": 1,
  "conflict": 1,
  "error": 0,
  "review": 2,
  "hydrants": [
    {
      "id": 123,
      "osm_id": 456789,
      "status": "PENDING_UPDATE",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Exemple resposta `/api/osm/status`:**

```json
{
  "osm_token_valid": true,
  "conflict_count": 1,
  "last_sync": "2024-01-15T10:30:00Z"
}
```

## 10. Troubleshooting

### 10.1. Problemes comuns i solucions

**Problema: "Token OSM no vàlid"**

- **Causa:** Token OAuth2 invàlid, expirat o sense permisos adequats
- **Solució:** Revisa el token a [OpenStreetMap OAuth2](https://www.openstreetmap.org/oauth2/applications), assegura-te que té scope `write_api`

**Problema: "Conflicte de xifrat" (SSL Certificate error)**

- **Causa:** Problema amb certificats SSL d'OSM o Overpass
- **Solució:** Actualitza els certificats del sistema o revisa la connectivitat

**Problema: "Resposta buida en importació"**

- **Causa:** L'ADF no té `osm_relations` configurades o l'àrea és massa gran
- **Solució:** Verifica les relacions OSM de l'ADF i divideix l'àrea si és necessari

**Problema: "Hidrants no apareixen a la llista"**

- **Causa:** Filtres incorrectes o permisos insuficients
- **Solució:** Revisa els filtres d'ADF i els permisos d'usuari

### 10.2. Logs depuració

Els següents logs són útils per depurar problemes OSM:

**Logs del backend** (stdout del contenidor: `docker compose logs -f backend`):

- Logs d'OSM sync: `[OSM] Pull sync completed` / `[OSM] Push sync failed`
- Logs de conflictes: `[OSM] Conflict detected for hydrant X`
- Logs de validació: `[OSM] Validation error: invalid tag Y`
- Logs d'Overpass: `[Overpass] Query successful` / `[Overpass] Query timeout`

**Logs detallats:**

- Nivell `debug` per veure peticions/respostes completes
- Nivell `error` per fallos específics d'OSM
