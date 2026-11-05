# Canviar el domini, la ubicació o el nom

Aquest document recull els passos per canviar coses que, per disseny, viuen en
**un sol lloc**. L'objectiu és que cap canvi de domini ni de carpeta obligui a
tocar codi.

| Què                     | On viu                                                        | Com es canvia                      |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Nom de l'aplicació      | `back/src/utils/appInfo.ts` i `front/src/utils/appInfo.ts`    | Editar `APP_NAME` (estable)        |
| Domini                  | `BASE_DOMAIN_URL` a `back/.env`                               | Una línia + `npm run nginx:render` |
| Host MQTT (opcional)    | `OTRC_HOST` a `back/.env`                                     | Només si difereix del domini       |
| Ubicació al disc        | La carpeta on és el repo (els scripts calculen `PROJECT_DIR`) | `mv` + reiniciar la pila           |
| Repositori de git       | Nom del repo al remot i als clons                             | Renombrar + `git remote set-url`   |
| URI de redirecció OSM   | Registre de l'aplicació a openstreetmap.org                   | Editar-la al formulari d'OSM       |
| Prefix MQTT             | `MQTT_TOPIC_PREFIX` a `back/.env`                             | Pendent (vegeu «Pendent» al final) |
| Claus de `localStorage` | `front/src/utils/storageKeys.ts`                              | Prefix nou; les velles s'ignoren   |

## 1. Canviar el domini

El domini és només el valor de `BASE_DOMAIN_URL` a `back/.env` i **no és fix**:
no apareix al codi ni a aquesta documentació. No editis
`config/site-docker.nginx` a mà: es genera i es sobreescriu.

> Si el canvi de domini forma part d'una migració més gran, la seqüència completa
> (DNS primer, certificat, nginx, backend, Mosquitto, Telegram, OSM i `.otrc`)
> és a **[docs/MIGRATION.md](MIGRATION.md)**.

1. **DNS / DDNS**: crea o apunta el nou nom a la IP del servidor. Si és un
   subdomini DDNS, espera que propagui.
2. **Certificat** (com a **root**: l'usuari de deploy no té sudo):
   ```bash
   certbot --nginx -d nou.domini.org
   ```
3. **Variable única** a `back/.env`:
   ```env
   BASE_DOMAIN_URL=nou.domini.org
   # Només si el broker OwnTracks és en un altre host:
   #OTRC_HOST=broker.altre.domini
   # Si el domini públic difereix del Host que rep el backend:
   #WEBHOOK_PUBLIC_URL=https://nou.domini.org
   ```
4. **Nginx** — genera `config/site-docker.nginx` amb el domini nou com a usuari
   de deploy:

   ```bash
   npm run nginx:render
   ```

   I instal·la'l com a **root** (a `$PROJECT_DIR`, que la sessió de root també
   ha de tenir exportat):

   ```bash
   cp config/site-docker.nginx /etc/nginx/sites-available/territoriadf
   ln -sfn /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf
   ls -l /etc/nginx/sites-enabled/   # territoriadf ha de ser un enllaç
   nginx -t && systemctl reload nginx
   ```

   Abans de sobreescriure'l, desa el lloc que hi hagi enllaçat a `sites-enabled`
   (`ls -l`): pot no dir-se `territoriadf` si ve d'una etapa anterior, i és el que
   cal per tornar enrere. Si l'enllaç vell queda actiu, nginx segueix servint el
   `server_name` i el certificat antics.

5. **Backend** (perquè rellegeixi `BASE_DOMAIN_URL`):
   ```bash
   docker compose up -d --force-recreate backend
   ```
6. **Certificats de Mosquitto** (el hook llegeix `BASE_DOMAIN_URL`). Com a
   **root**: `/etc/letsencrypt/live/` només el pot llegir root i el script fa
   `chown 1883:1883`, així que amb l'usuari de deploy falla amb
   `no existeix …/fullchain.pem`:
   ```bash
   cd "$PROJECT_DIR"
   bash scripts/copy-mosquitto-certs.sh
   ```
7. **Telegram**: la URL del webhook queda registrada a Telegram en crear el bot.
   Canviar de domini **no** l'actualitza: torna a registrar el bot de cada ADF
   des de _Configuració → Notificacions de Telegram_ (o `setWebhook` per API).
   Comprova amb `getWebhookInfo` que apunta al domini nou (`"url":""` vol dir
   que el bot no té cap webhook i no rep res). Amb el bot ja configurat el panell
   no dona camp per al token: primer «⛔ Desconnectar Telegram» i tornar a fer
   l'alta (token → _Validar bot_ → _Vincular grup_). Re-registrar buida el grup
   vinculat, així que cal tornar a enllaçar-lo abans de provar les notificacions.
   El bot global de l'admin (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` a
   `back/.env`) no té ADF ni webhook: només envia avisos, no cal tocar-lo. Si
   canvies el token, edita `back/.env` i `docker compose up -d --force-recreate
backend` (es llegeix a l'arrencada).
8. **Aplicació OAuth d'OSM**: si fas push sync, actualitza l'**URI de
   redirecció** al registre de l'aplicació a
   <https://www.openstreetmap.org/oauth2/applications> perquè apunti al domini
   nou. El token `OSM_ACCESS_TOKEN` continua valent, però el registre ha de
   coincidir amb el desplegament (i OSM exigeix una URI vàlida al formulari).
9. **Sessions**: la cookie `auth_token` és host-only. En canviar de domini tothom
   haurà de tornar a entrar (no perden la contrasenya).
10. **Comprovacions**: `https://nou.domini.org/api/config`, login, mapa,
    descàrrega d'un `.otrc` i tracking d'una unitat.

> Si el domini antic encara ha de funcionar, mantén el seu bloc a nginx amb un
> `return 301 https://nou.domini.org$request_uri;` i el certificat corresponent.

## 2. Canviar la ubicació al disc

Els scripts de `scripts/` calculen `PROJECT_DIR` a partir de la seva pròpia
posició, i `docker-compose.yml` fixa `name: territoriadf`, de manera que moure
la carpeta **no** canvia el nom del projecte Docker ni crea una pila nova.

Defineix la ubicació actual i la nova una sola vegada:

```bash
export OLD_PROJECT_DIR=/ruta/al/repo-actual   # origen
export PROJECT_DIR=/ruta/al/repo-nou          # destí
```

1. **Atura la pila** (sense `-v`, per no esborrar res):
   ```bash
   cd "$OLD_PROJECT_DIR"
   docker compose down
   ```
2. **Mou la carpeta** (com a **root**):
   ```bash
   mv "$OLD_PROJECT_DIR" "$PROJECT_DIR"
   cd "$PROJECT_DIR"
   ```
3. **Aixeca-la**:
   ```bash
   docker compose up -d
   ```
4. **Cron**: els camins absoluts del crontab apunten a la ubicació antiga.
   Reinstal·la'ls des de la ubicació nova:
   ```bash
   ./scripts/backup/setup-cron.sh install
   ```
5. **Hook de certbot**: si és un enllaç simbòlic al repo, torna'l a crear
   apuntant a la ubicació nova.
6. **Nginx**: no depèn de la ruta del repo, però torna a renderitzar-lo si has
   canviat també el domini.
7. **Comprovacions**: `docker compose ps`, `curl http://127.0.0.1:3034/api/adfs`,
   `./scripts/backup/check-backups.sh`.

> **Vindre d'una pila amb un altre nom**: si el `docker-compose.yml` anterior no
> tenia `name:`, el projecte Compose prenia el nom de la carpeta. Atura'l
> explícitament abans de pujar el nou perquè no quedin contenidors ni ports
> ocupats:
>
> ```bash
> docker compose -p <projecte-anterior> down
> ```
>
> Els contenidors actuals són `territoriadf-backend`, `territoriadf-frontend` i
> `territoriadf-mosquitto`; les imatges, `territoriadf-backend:latest` i
> `territoriadf-frontend:latest`.
>
> Per a una migració completa (primer la identitat de la pila, després el domini)
> segueix **[docs/MIGRATION.md](MIGRATION.md)**. Les dades concretes de cada
> migració (noms antics, dominis, dates, commits) no es guarden en aquesta
> documentació: van a l'expedient `docs/migracio/`, que no es versiona.

## 3. Canviar el nom de l'aplicació

El nom estable és `TerritoriADF` i viu a dues constants (`APP_NAME`). No inclou
el domini ni la carpeta. Si algun dia canvia:

1. Edita `APP_NAME` a `back/src/utils/appInfo.ts` i `front/src/utils/appInfo.ts`.
2. Actualitza els noms de paquets (`package.json` de l'arrel, `back/` i `front/`)
   i regenera el lockfile amb `npm install --package-lock-only`.
3. Actualitza `container_name`/`image`/xarxa a `docker-compose.yml` i els noms
   de contenidor i prefix de backup als scripts. Els noms actuals són
   `territoriadf-backend`, `territoriadf-frontend` i `territoriadf-mosquitto`.
4. Revisa títols i textos de `README.md`, `AGENTS.md` i `docs/`.

## 4. Renombrar els backups existents

Els scripts nous generen `territoriadf_<tipus>_<data>.tar.gz`. Si els backups
antics portaven un altre prefix, cal renombrar-los perquè segueixin sent
visibles per a la rotació i la restauració:

```bash
cd "$PROJECT_DIR/backups"
OLD_PREFIX=<prefix-antic>      # el que portessin els fitxers existents
NEW_PREFIX=territoriadf

for f in */*.tar.gz; do
  [ -e "$f" ] || continue
  mv "$f" "$(dirname "$f")/$(basename "$f" | sed "s/^${OLD_PREFIX}_/${NEW_PREFIX}_/")"
done
```

El `*/*.tar.gz` cobreix els quatre períodes i també `pre-deploy/`. El contingut
dels fitxers no depèn del nom, així que renombrar-los no afecta la restauració.

## 5. Canviar el nom del repositori de git

El nom del repositori **no** afecta l'aplicació: ni el codi, ni els noms de
contenidor o imatge, ni el domini en depenen. Però si el repo encara porta un
nom antic (per exemple, el del projecte abans del canvi de marca), canvia'l per
no arrossegar-lo a les URL i als clons:

1. **Renombra'l al remot**: _Settings → Repository name_ al GitHub (o
   `gh repo rename <nou-nom>` si hi tens `gh`). GitHub redirigeix les URL
   antigues, però no actualitza els remots dels clons.
2. **Actualitza els remots** de cada clon, també el del servidor:
   ```bash
   git remote set-url origin <url-nova-del-repositori>
   git remote -v     # comprova-ho
   ```
3. **Revisa el que en depèn**: badges i enllaços de `README.md`, filtres de CI
   (`.github/workflows/`), integracions o webhooks que apuntin a l'URL antiga.
   La documentació fa servir `<url-del-repositori>` com a plantilla, així que no
   l'has de retocar.
4. **Comprovacions**: `git fetch --all` i, al servidor,
   `npm run docker:deploy -- --dry-run` (l'actualització real fa
   `git pull --ff-only`, que falla si el remot no respon).

## Pendent (fases posteriors)

Aquests canvis toquen estat o dispositius i es fan en una finestra a part:

- **`MQTT_TOPIC_PREFIX`**: passar a `owntracks/territoriadf` obliga a regenerar
  les ACL de DynSec (`npm run mqtt:regen-dynsec` o `sync-dynsec`), recrear els
  clients i redistribuir els `.otrc` als dispositius.
- **Claus de `localStorage`**: canviar-les (o migrar-les amb un helper que
  llegeixi l'antiga i escrigui la nova) per no perdre preferències de la UI.
- **Fitxer de la BD**: ja es diu `territoriadf.db` i el fitxer antic es renombra
  sol a l'arrencada del backend (vegeu `back/src/db/index.ts`), amb els scripts de
  backup/restore preparats per trobar l'un o l'altre.
- **Claus de `localStorage`**: ja porten el prefix `territoriadf_`. No es
  migren: les velles (`hidrants_*`) es descarten, així que qui tenia preferències
  desades les veurà una vegada als valors per defecte.
- `db:reset-hidrants` **no** és un nom de marca: buida la taula d'hidrants i la
  torna a importar d'OSM, així que es queda com és.
