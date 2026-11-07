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
| Prefix MQTT             | `MQTT_TOPIC_PREFIX` a `back/.env`                             | Coordinat: DynSec + `.otrc` (§6.1) |
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

1. **Atura la pila** (sense `-v`, per no esborrar res). Fes-ho fora de la
   franja dels backups (03:00–04:30):
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
4. **Crons**. N'hi ha dos jocs i tots dos guarden camins absoluts:

   - **Backups** (crontab de l'usuari que els va instal·lar). Reinstal·la'ls des
     de la ubicació nova, responent `sí` a la reinstal·lació:
     ```bash
     ./scripts/backup/setup-cron.sh install
     ```
     `setup-cron.sh` només esborra les línies que apunten al camí **actual**, de
     manera que les entrades del camí antic sobreviuen a cada reinstal·lació i es
     dupliquen. Treu-les abans, conservant una còpia del crontab:
     ```bash
     crontab -l > ~/crontab.abans.txt
     crontab -l \
       | grep -vE 'scripts/backup/backup\.sh' \
       | grep -vE '^# (TerritoriADF|Hidrants( ADF)?) Backups' \
       | grep -vE '^# Backup (diari|setmanal|mensual|semestral)' \
       > /tmp/crontab.net
     crontab /tmp/crontab.net
     ./scripts/backup/setup-cron.sh install
     ```
     Hauria de quedar una sola tanda de quatre línies, totes amb el camí nou.
   - **Seguretat** (`/etc/cron.d/territoriadf-security`, instal·lat a mà). Com a
     root, actualitza-hi el camí del script de logwatch:
     ```bash
     # <ruta-antiga> = camí absolut que encara hi apareix (per exemple l'antic PROJECT_DIR)
     # <ruta-nova>   = camí absolut nou; <fitxer-security> = nom actual del fitxer de cron
     grep -n '<ruta-antiga>' /etc/cron.d/<fitxer-security>
     sed -i 's|<ruta-antiga>|<ruta-nova>|g' /etc/cron.d/<fitxer-security>
     ```
     Si el fitxer encara té un nom d'etapa anterior, reanomena'l: cron ignora els
     fitxers amb punt al nom, i `mv` conserva el `mtime`, així que cal `touch`
     perquè el rellegeixi.
     ```bash
     mv /etc/cron.d/<fitxer-security-antic> /etc/cron.d/<fitxer-security>
     touch /etc/cron.d/<fitxer-security>
     grep -rn '<fitxer-security-antic>' /etc 2>/dev/null
     ```
     Si el fitxer no existeix, no hi ha res a fer.

5. **Hook de certbot**. Si és un enllaç simbòlic al repo, queda penjant amb el
   `mv`. Torna'l a crear:
   ```bash
   ls -l /etc/letsencrypt/renewal-hooks/deploy/
   ln -sfn "$PROJECT_DIR/scripts/copy-mosquitto-certs.sh" \
     /etc/letsencrypt/renewal-hooks/deploy/copy-mosquitto-certs.sh
   ```
   Prova'l sense `RENEWED_LINEAGE` (buit vol dir «executa igualment»): copia els
   certificats i reinicia Mosquitto.
   ```bash
   cd / && /etc/letsencrypt/renewal-hooks/deploy/copy-mosquitto-certs.sh
   ```
6. **Reste de camins absoluts**. Nginx i `back/.env` no haurien de contenir la
   ruta del repo, però comprova-ho (com a root, per a `/etc`):
   ```bash
   grep -rn '<ruta-antiga>' /etc/cron* /etc/nginx /etc/systemd/system \
     /etc/letsencrypt/renewal-hooks 2>/dev/null
   grep -n '<ruta-antiga>\|<ruta-nova>' back/.env
   ```
   Nginx no depèn de la ruta del repo; només cal tornar a renderitzar-lo si has
   canviat també el domini.
7. **Sessions obertes**: reexporta `PROJECT_DIR` i torna a entrar a la carpeta
   nova; les shells que ja hi eren dins conserven el `cwd` antic.
8. **Comprovacions**: `docker compose ps`, `curl http://127.0.0.1:3034/api/adfs`,
   `./scripts/backup/check-backups.sh` i `./scripts/backup/setup-cron.sh status`.

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

## 6. Canvis que toquen dispositius o estat

Aquests canvis no es resolen amb una línia a `back/.env`: afecten clients o
dades ja existents, així que es fan en una finestra a part i amb els dos extrems
coordinats.

### 6.1 `MQTT_TOPIC_PREFIX`

El prefix per defecte és `owntracks/territoriadf` i el backend només escolta
`${MQTT_TOPIC_PREFIX}/#`. Canviar-lo invalida les ACL de DynSec i els `.otrc` ja
distribuïts, per tant la seqüència és:

1. Edita `MQTT_TOPIC_PREFIX` a `back/.env`.
2. Regenera la seguretat del broker: `npm run mqtt:regen-dynsec` (recrea els
   clients d'usuari) o `npm run mqtt:sync-dynsec` (conserva els clients i només
   actualitza `admin`, `backend` i els rols).
3. Reinicia els serveis: `docker compose up -d mosquitto backend`.
4. Torna a descarregar el `.otrc` de cada dispositiu des de la seva fitxa
   d'usuari i reinstal·la'l a OwnTracks; el fitxer ja surt amb el topic nou i la
   identitat aplanada (`123/GI/007` → `123_GI_007`).
5. Comprova que arriben posicions (`GET /api/tracking/positions`): mentre un
   dispositiu conservi el topic vell, les seves dades no es reben.

### 6.2 Claus de `localStorage`

Les claus porten un prefix definit a `front/src/utils/storageKeys.ts`. Si el
canvies, o bé migres les velles amb un helper que llegeixi l'antiga i escrigui la
nova, o bé acceptes que els usuaris perdin les preferències desades i tornin als
valors per defecte. No hi ha migració automàtica.

### 6.3 Fitxer de la base de dades

El fitxer es diu `territoriadf.db`. Un nom anterior es renombra sol a l'arrencada
del backend (`back/src/db/index.ts`) i els scripts de backup/restore troben l'un
o l'altre, així que no cal fer res a mà.

### 6.4 `db:reset-hidrants`

No és un nom de marca: buida la taula d'hidrants i la torna a importar d'OSM. Es
queda igual a qualsevol desplegament.
