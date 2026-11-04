# Canviar el domini, la ubicació o el nom

Aquest document recull els passos per canviar coses que, per disseny, viuen en
**un sol lloc**. L'objectiu és que cap canvi de domini ni de carpeta obligui a
tocar codi.

| Què                       | On viu                                                        | Com es canvia                      |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Nom de l'aplicació        | `back/src/utils/appInfo.ts` i `front/src/utils/appInfo.ts`    | Editar `APP_NAME` (estable)        |
| Domini                    | `BASE_DOMAIN_URL` a `back/.env`                               | Una línia + `npm run nginx:render` |
| Host MQTT (opcional)      | `OTRC_HOST` a `back/.env`                                     | Només si difereix del domini       |
| Ubicació al disc          | La carpeta on és el repo (els scripts calculen `PROJECT_DIR`) | `mv` + reiniciar la pila           |
| Repositori de git         | Nom del repo al remot i als clons                             | Renombrar + `git remote set-url`   |
| URI de redirecció OSM     | Registre de l'aplicació a openstreetmap.org                   | Editar-la al formulari d'OSM       |
| Prefix MQTT / claus local | `MQTT_TOPIC_PREFIX` / codi del front                          | Pendent (vegeu «Pendent» al final) |

## 1. Canviar el domini

El domini és només el valor de `BASE_DOMAIN_URL` a `back/.env` i **no és fix**:
no apareix al codi ni a aquesta documentació. No editis
`config/site-docker.nginx` a mà: es genera i es sobreescriu.

1. **DNS / DDNS**: crea o apunta el nou nom a la IP del servidor. Si és un
   subdomini DDNS, espera que propagui.
2. **Certificat**:
   ```bash
   sudo certbot --nginx -d nou.domini.org
   ```
3. **Variable única** a `back/.env`:
   ```env
   BASE_DOMAIN_URL=nou.domini.org
   # Només si el broker OwnTracks és en un altre host:
   #OTRC_HOST=broker.altre.domini
   # Si el domini públic difereix del Host que rep el backend:
   #WEBHOOK_PUBLIC_URL=https://nou.domini.org
   ```
4. **Nginx** (genera `config/site-docker.nginx` amb el domini nou):
   ```bash
   npm run nginx:render
   sudo cp config/site-docker.nginx /etc/nginx/sites-available/territoriadf
   sudo ln -sf /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf
   sudo nginx -t && sudo systemctl reload nginx
   ```
5. **Backend** (perquè rellegeixi `BASE_DOMAIN_URL`):
   ```bash
   docker compose up -d --force-recreate backend
   ```
6. **Certificats de Mosquitto** (el hook llegeix `BASE_DOMAIN_URL`):
   ```bash
   bash scripts/copy-mosquitto-certs.sh
   ```
7. **Telegram**: la URL del webhook queda registrada a Telegram en crear el bot.
   Canviar de domini **no** l'actualitza: torna a registrar el bot de cada ADF
   des de _Configuració → Notificacions de Telegram_ (o `setWebhook` per API).
   Comprova amb `getWebhookInfo` que apunta al domini nou.
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
2. **Mou la carpeta**:
   ```bash
   sudo mv "$OLD_PROJECT_DIR" "$PROJECT_DIR"
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

> **Primera migració des de la pila antiga**: el `docker-compose.yml` anterior no
> tenia `name:` i el projecte es deia `hidrants`. Atura'l explícitament abans de
> pujar el nou perquè no quedin contenidors i ports ocupats:
> `docker compose -p hidrants down`.
>
> Els contenidors nous són `territoriadf-backend`, `territoriadf-frontend` i
> `territoriadf-mosquitto`; les imatges, `territoriadf-backend:latest` i
> `territoriadf-frontend:latest`.

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

Els scripts nous generen `territoriadf_<tipus>_<data>.tar.gz`. Perquè els
backups antics segueixin sent visibles per la rotació i la restauració:

```bash
cd "$PROJECT_DIR/backups"
for f in daily/*.tar.gz weekly/*.tar.gz monthly/*.tar.gz semester/*.tar.gz; do
  [ -e "$f" ] || continue
  mv "$f" "$(dirname "$f")/$(basename "$f" | sed 's/^hidrants_/territoriadf_/')"
done
# Còpies prèvies de desplegament
for f in pre-deploy/hidrants_predeploy_*.tar.gz; do
  [ -e "$f" ] || continue
  mv "$f" "$(dirname "$f")/$(basename "$f" | sed 's/^hidrants_/territoriadf_/')"
done
```

## 5. Canviar el nom del repositori de git

El nom del repositori **no** afecta l'aplicació: ni el codi, ni els noms de
contenidor o imatge, ni el domini en depenen. Però si el repo encara porta un
nom antic (per exemple, el del projecte abans del canvi de marca), canvia'l per
no arrossegar-lo a les URL i als clons:

1. **Renombra'l al remot** (GitHub redirigeix les URL antigues, però no
   actualitza els remots dels clons):
   ```bash
   gh repo rename <nou-nom>     # o Settings → Repository name
   ```
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
- **Fitxer `hidrants.db`** i prefix `db:reset-hidrants`: renombrar la BD i els
  scripts de backup/restore alhora, amb una còpia prèvia.
