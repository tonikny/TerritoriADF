# Migrar una instància: pila nova i canvi de domini

Guia **genèrica** per renombrar la pila d'una instància (projecte Compose,
contenidors, imatges, scripts, marca) i, si cal, moure-la a un domini nou. No
conté cap domini, correu, URL ni data concreta: aquestes dades viuen a
l'expedient de cada migració (vegeu «Com s'organitza la documentació»).

Si només canvies **un** valor d'un sol lloc (el domini, la carpeta, el nom de
l'aplicació), la referència curta és [`DOMAIN_CHANGE.md`](DOMAIN_CHANGE.md).
Aquest document és per quan el canvi afecta la pila sencera i cal ordre,
verificacions i rollback.

## Com s'organitza la documentació

| Tipus                     | On                      | Contingut                                             | Es queda a `main` |
| ------------------------- | ----------------------- | ----------------------------------------------------- | ----------------- |
| Permanent, genèrica       | `docs/MIGRATION.md`     | Aquest runbook, sense dades d'instància               | Sí                |
| Permanent, d'un sol valor | `docs/DOMAIN_CHANGE.md` | Domini, ubicació, nom de l'app, repo                  | Sí                |
| Expedient d'una migració  | `docs/migracio/`        | Dominis reals, dates, commits, decisions, incidències | **No**            |
| Operativa diària          | `docs/DEPLOY.md`        | Desplegament, backups, actualitzacions                | Sí                |

L'expedient (`docs/migracio/`) és el que permet que aquest document segueixi
sent genèric: allà s'apunta el domini antic i el nou, el commit de partida, el
fitxer de backup i les decisions preses. **S'esborra abans de fusionar la branca
a `main`**; si cal conservar-ne alguna cosa, es generalitza aquí primer.

## Convencions de noms

| Símbol           | Vol dir                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `<pila-antiga>`  | Nom del projecte Compose i dels contenidors abans de la migració  |
| `<pila-nova>`    | Nom que prendran després                                          |
| `<domini-antic>` | Domini que s'està servint actualment                              |
| `<domini-nou>`   | Domini de destí                                                   |
| `$PROJECT_DIR`   | Carpeta del repo al servidor; els scripts la calculen, no és fixa |

En aquest projecte, la pila nova és la que descriuen `docker-compose.yml`
(`name: territoriadf`), els scripts de `scripts/` i `docs/DEPLOY.md`. Els noms
de la pila antiga són a l'expedient.

L'usuari que desplega l'aplicació **no té sudo**. Els passos que toquen
`/etc/nginx`, `/etc/letsencrypt` o `/root` van marcats **Root** i es fan en una
sessió de root (`su -`), sense `sudo` al davant; la resta, amb l'usuari que
desplega.

## Per què en dues fases

Fer-ho tot de cop barreja dos riscos: canviar la identitat dels contenidors i
canviar el domini. Si alguna cosa falla, no se sap quin dels dos ha trencat.

- **Fase 1 — identitat de la pila, sense tocar el domini.** Com que el domini no
  canvia, la cookie de sessió (`auth_token`, host-only) continua valent, el
  certificat actual continua cobrint el servei i els dispositius MQTT no perden
  TLS. El rollback és de codi i contenidors.
- **Fase 2 — domini.** Toca DNS, certificats, nginx, Telegram, OSM, `.otrc` i
  sessions. És la que nota l'usuari.

`main` no es fusiona fins que la fase 2 estigui validada: mentrestant és la xarxa
de seguretat i la font de veritat per a un rollback complet.

---

## Fase 1 — Identitat de la pila

### 1.1 Preparar la branca

Tot el canvi viu en una branca de treball; `main` no es toca fins al final.

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
npm run typecheck && npm run lint
git push -u origin <branca>
```

El PR obre'l des de la web (`<remot>/compare/main...<branca>`) o amb
`gh pr create --draft --base main --head <branca>` si el tens instal·lat; no cal
`gh` per a res d'aquest runbook.

- **`-u` no és opcional**: `scripts/deploy/update.sh` exigeix upstream
  (`@{u}`) i sense això s'atura.
- **El PR en draft és el que executa la CI**: si el workflow només s'activa en
  `push` a `main`/`develop` i en `pull_request`, pujar una branca no el dispara.
- **Comprova que no hi ha canvis d'esquema**
  (`git diff --name-only origin/main...HEAD -- back/drizzle back/src/db`). Si
  n'hi hagués, el rollback hauria d'incloure la restauració de la BD.
- Si vols reorganitzar els commits, fes-ho **abans** de pujar la branca: un cop
  el servidor hi és, un `rebase` obliga a `force-push` i a `reset --hard` al
  servidor.

### 1.2 Inventari del servidor (només lectura)

```bash
cd "$PROJECT_DIR"
git rev-parse HEAD                                   # commit de rollback
docker compose ls -a                                 # projecte de la pila antiga
docker ps -a --format 'table {{.Names}}\t{{.Image}}'
docker images --format '{{.Repository}}:{{.Tag}}' | grep -i <pila-antiga>
grep -E '^(BASE_DOMAIN_URL|OTRC_HOST)=' back/.env
crontab -l | sed -n '/Backups/,+8p'
df -h "$PROJECT_DIR"
```

Apunta't el commit de rollback **fora del repo**. `df -h` importa: el build
necessita espai per a dues imatges noves. Les imatges de la pila antiga són el
vehicle de rollback: no les esborris fins que la fase 2 estigui validada.

### 1.3 Còpia de seguretat amb els scripts **antics**

```bash
./scripts/backup/backup.sh daily
tar -czf "backups/pre-deploy/manual-pre-migracio-$(date +%F_%H%M).tar.gz" back/data
cp -p back/.env back/.env.pre-migracio && chmod 600 back/.env.pre-migracio
```

L'ordre és el punt que més es falla: els scripts nous busquen el contenidor
`<pila-nova>-backend` i el prefix `<pila-nova>_`, que encara no existeixen. Amb
el codi antic, el backup funciona i coneix el contenidor de debò. El `tar`
manual i la còpia del `.env` són redundants a posta: si l'script falla a mig
camí, hi ha una còpia que no depèn de res.

### 1.4 `back/.env`: fixar `BASE_DOMAIN_URL` abans de desplegar

```env
BASE_DOMAIN_URL=<domini-antic>
```

Encara que el domini no canviï, **fixa'l explícitament**. Si el codi nou fa que
alguna URL derivada caigui a `BASE_DOMAIN_URL` i el valor per defecte és
`localhost`, un `.env` sense la variable produeix una regressió silenciosa: la
descàrrega del `.otrc` funciona i el dispositiu simplement no connecta.

No toquis `JWT_SECRET`, `ENCRYPTION_SECRET` ni les contrasenyes MQTT. Canviar
`ENCRYPTION_SECRET` invalida els secrets xifrats de la BD (contrasenyes MQTT per
usuari, tokens de Telegram) i obliga a tornar-ho a configurar; canviar
`JWT_SECRET` desconnecta tothom. Cap de les dues coses és necessària per
renombrar contenidors.

### 1.5 Portar el codi i construir **sense aturar res**

```bash
git fetch origin
git switch -c <branca> --track origin/<branca>
npm ci --no-audit --no-fund
docker compose build
```

El build és el pas llarg i el que més probablement falla. Fer-lo abans del `down`
vol dir que, si peta, l'aplicació antiga segueix servint i simplement s'avorta;
fer-lo després converteix un error de build en una caiguda.

Si l'arbre de treball no és net, **no facis `checkout -f`**: mira què és. Un
fitxer modificat al servidor sol ser una edició manual que et carregaràs a la
propera actualització.

### 1.6 Aturar la pila antiga

```bash
docker compose -p <pila-antiga> down
ss -ltnp | grep -E ':(<ports-publicats>)\b'   # ha de sortir buit
```

`-p <pila-antiga>` és imprescindible: a partir del `checkout`, `docker compose`
llegeix el fitxer nou, que declara un altre projecte. Sense `-p`, el `down` no
atura res de la pila vella, els ports queden ocupats i el `up` falla amb
`address already in use`.

**Sense `-v`**: si els volums són _bind mounts_ no esborra res avui, però és una
drecera perillosa si algun dia n'hi ha un de nominal.

Aquí comença la parada.

### 1.7 Aixecar la pila nova

```bash
docker compose up -d
docker compose ps
```

Comprova què es conserva i què es torna a crear:

- El backend aplica les migracions en arrencar.
- El broker reaprofita el seu directori de dades, així que els usuaris i les
  contrasenyes de Dynamic Security es conserven.
- Els certificats del broker no canvien si el domini no canvia: **no cal**
  executar l'script de còpia de certificats en aquesta fase.

### 1.8 Verificar

```bash
curl -fsS http://127.0.0.1:<port-backend>/api/adfs >/dev/null && echo "API ok"
curl -fsS https://<domini-antic>/api/config
docker compose logs --tail=80 backend | grep -iE "error|mqtt|migrat"
```

A la UI: login **sense** haver de tornar a entrar, mapa, dades reals,
**descàrrega d'un `.otrc` comprovant que el `host` és el domini actual** i una
unitat publicant posició (valida broker + Dynamic Security + backend alhora).

### 1.9 Backups i cron amb els noms nous

```bash
cd "$PROJECT_DIR/backups"
for f in */*.tar.gz; do
  [ -e "$f" ] || continue
  mv "$f" "$(dirname "$f")/$(basename "$f" | sed 's/^<pila-antiga>_/<pila-nova>_/')"
done

cd "$PROJECT_DIR"
./scripts/backup/setup-cron.sh install
./scripts/backup/setup-cron.sh status
./scripts/backup/backup.sh daily
./scripts/backup/check-backups.sh
```

Els scripts nous busquen el prefix nou: si no es renombren, els backups antics
queden invisibles per a la rotació i la comprovació informa de zero backups.
`setup-cron.sh install` detecta el marcador existent i reinstal·la net, sense
duplicar les línies. El backup manual és la prova que contenidor i prefix nous
funcionen de punts a punts.

### 1.10 Rollback de la fase 1

L'ordre és l'invers del pas 1.6 i té el mateix parany:

```bash
cd "$PROJECT_DIR"
docker compose -p <pila-nova> down      # amb el compose nou, atura la pila nova
git switch --detach <commit-anterior>
docker compose up -d                    # compose antic: projecte <pila-antiga>
```

Si es fa el `checkout` abans del `down`, el `docker compose down` llegeix el
fitxer antic, busca el projecte antic i no atura res del que està corrent. Si
calguessin restaurar dades, cal l'script de restauració de la revisió antiga,
perquè el nou busca el contenidor nou.

---

## Fase 2 — Canvi de domini

### 2.1 DNS / DDNS (primer de tot)

Crea o apunta el nom nou a la IP del servidor. Si el domini és gratuït i exigeix
confirmació periòdica, programa-la abans de la finestra. No continuïs fins que
`dig +short <domini-nou>` respongui la IP correcta **des de fora** del servidor.

Si el proveïdor permet tenir dos noms alhora, crea el nou **abans** de tocar
l'antic: la parada queda en un `reload`. Si no els permet, o cal cancel·lar
l'antic per fer lloc, el canvi és un **tall net**: no hi ha redirect ni doble
servei, la parada inclou la propagació del nom i l'emissió del certificat, i el
rollback depèn de poder recrear el nom antic.

### 2.2 Certificat

**Root.**

```bash
certbot certonly --nginx -d <domini-nou> --dry-run
certbot certonly --nginx -d <domini-nou>
```

La prova en sec valida DNS, accés al port 80 i límits de Let's Encrypt sense
gastar intents. El certificat nou **només cobreix el domini nou**: si algun
dispositiu encara apunta a l'antic, perdrà TLS. Comprova que el hook de renovació
segueix enllaçat a `scripts/copy-mosquitto-certs.sh`; llegeix `BASE_DOMAIN_URL`,
així que no cal tocar-lo.

Amb `certonly` el certificat queda a `/etc/letsencrypt/live/<domini-nou>/` i el
lloc de nginx el referencia, sense que certbot reescrigui el fitxer. Si el
`server_name` actual encara és el domini antic, el plugin `nginx` no troba cap
bloc on validar; aleshores cal un bloc temporal només HTTP pel nom nou, que
s'esborra en instal·lar el lloc definitiu:

```bash
tee /etc/nginx/sites-available/territoriadf-acme >/dev/null <<'EOF'
server {
    listen 80;
    server_name <domini-nou>;
    location /.well-known/acme-challenge/ { root /var/www/html; }
}
EOF
ln -sfn /etc/nginx/sites-available/territoriadf-acme /etc/nginx/sites-enabled/territoriadf-acme
nginx -t && systemctl reload nginx
```

### 2.3 `back/.env`

```env
BASE_DOMAIN_URL=<domini-nou>
#OTRC_HOST=broker.altre.domini    # només si el broker és en un altre host
```

Si `OTRC_HOST` apuntava al domini antic, esborra'l (o actualitza'l): el `.otrc`
ha de sortir del domini nou. No canviïs secrets: els usuaris del broker i els
tokens de Telegram xifrats han de continuar valent.

### 2.4 Nginx del host

**Usuari que desplega** — genera el fitxer al repo:

```bash
cd "$PROJECT_DIR"
npm run nginx:render
```

**Root** — desa el lloc actual i instal·la el nou:

```bash
cd "$PROJECT_DIR"
ls -l /etc/nginx/sites-enabled/            # pot ser un fitxer normal, no un enllaç
SITE=$(grep -l '<domini-actual>' /etc/nginx/sites-enabled/*)   # pot haver-n'hi més d'un
cp -p "$SITE" /root/site-pre-canvi.nginx
cp config/site-docker.nginx /etc/nginx/sites-available/territoriadf
ln -sfn /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf
for f in $(grep -l '<domini-actual>' /etc/nginx/sites-enabled/* 2>/dev/null); do
  rm -f "$f"        # tots els llocs vells, no només un
done
rm -f /etc/nginx/sites-enabled/territoriadf-acme
nginx -t && systemctl reload nginx
```

El fitxer que apareix a `sites-enabled` **no** ha de dir-se `territoriadf`: si ve
d'una etapa anterior de la mateixa instància, pot conservar el nom de l'app
antiga. Desa'l abans de tocar-hi (és el que restaura el rollback) i treu
l'enllaç vell de `sites-enabled`: si hi queda, nginx segueix servint el seu
`server_name` i el seu certificat, i la verificació del domini antic no passa.

`config/site-docker.nginx` és **sortida** de la plantilla: no s'edita a mà. Un
redirect des del domini antic només té sentit si aquell nom encara existeix i té
certificat; aleshores va al lloc del host, no a la plantilla, perquè el proper
render el sobreescriuria. Si l'antic s'ha cancel·lat, no hi ha bloc de redirect:
el servidor només respon pel nom nou.

### 2.5 Backend amb el domini nou

```bash
docker compose up -d --force-recreate backend
curl -fsS https://<domini-nou>/api/config
```

El backend llegeix `BASE_DOMAIN_URL` a l'arrencada; sense recrear-lo, el `.otrc`
i les URLs derivades segueixen amb el valor vell.

### 2.6 Certificats del broker

```bash
bash scripts/copy-mosquitto-certs.sh
```

Copia els certificats del domini nou, ajusta permisos i propietari i reinicia el
broker. Sense això, el port TLS presenta el certificat vell i els `.otrc` nous
fallen amb error de certificat.

### 2.7 Telegram i OSM

- **Telegram:** la URL del webhook queda registrada amb el domini del moment de
  crear el bot; canviar de domini **no** l'actualitza. Re-registra el bot de cada
  ADF des de la UI i comprova'l amb `getWebhookInfo`.
- **OSM:** actualitza l'URI de redirecció al registre de l'aplicació a
  <https://www.openstreetmap.org/oauth2/applications>. El token no caduca.

### 2.8 Dispositius i sessions

- Tothom ha de **tornar a entrar**: la cookie de sessió és host-only.
- Tothom ha de **tornar a descarregar el `.otrc`** i reimportar-lo. Les
  credencials del broker no canvien, així que no cal recrear usuaris.
- Si el domini antic desapareix, el `.otrc` vell no falla l'autenticació: el host
  no resol. Cal insistir en la re-descàrrega, no només en reiniciar l'app.
- Avisa abans de la finestra; si no, els primers avisos seran «el tracking no
  funciona» quan en realitat és el `.otrc` vell.

### 2.9 Verificació

```bash
docker compose ps
curl -fsS https://<domini-nou>/api/config
openssl s_client -connect <domini-nou>:<port-tls> -servername <domini-nou> </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

- [ ] HTTPS amb certificat vàlid i sense avisos al navegador.
- [ ] `/api/config` respon i el login funciona.
- [ ] `.otrc` nou amb `host` del domini nou, port TLS i `tls: true`.
- [ ] Una unitat amb el `.otrc` nou publica i es veu al mapa.
- [ ] `getWebhookInfo` mostra el domini nou i un missatge de prova arriba.
- [ ] Backups verds amb el prefix nou.
- [ ] Si el domini antic encara existeix, `curl -I https://<domini-antic>/` → `301`; si s'ha cancel·lat, cap referència a l'antic al `.env`, a nginx ni al `.otrc`.
- [ ] Logs sense errors de broker ni de certificat.

### 2.10 Rollback per trams

No cal desfer-ho tot per un sol error:

| Tram       | Rollback                                                                     |
| ---------- | ---------------------------------------------------------------------------- |
| Nginx      | Restaurar la còpia anterior del lloc i `nginx -t && systemctl reload nginx`  |
| `.env`     | Tornar `BASE_DOMAIN_URL` al valor anterior i `--force-recreate backend`      |
| Certificat | El certificat antic continua a `/etc/letsencrypt/live/<domini-antic>/`       |
| Broker     | Tornar a executar l'script de còpia de certificats amb el domini antic       |
| Telegram   | Re-registrar el bot amb el domini antic                                      |
| DNS        | Recrear el nom antic al proveïdor; si no es pot, no hi ha rollback de domini |

La fase 1 continua sent vàlida encara que la fase 2 es desfaci: el domini és
només una variable.

---

## Tancament

1. Verificacions de la fase 2 completes.
2. **Esborrar l'expedient** (`docs/migracio/`) o generalitzar-ne el que calgui.
3. Treure el PR de draft, revisar el diff i fusionar a `main`.
4. Posar el servidor a `main` i desplegar-hi:
   ```bash
   git switch main && git pull --ff-only
   npm run docker:deploy -- --dry-run
   npm run docker:deploy
   ```
5. Neteja: imatges de la pila antiga, còpies `.env` temporals i còpies manuals de
   pre-desplegament quan expiri la retenció; el certificat antic, **com a
   root**, amb `certbot delete --cert-name <domini-antic>` quan ja no faci falta.
6. Actualitzar `docs/DOMAIN_CHANGE.md` si algun pas ha canviat.

## Errors freqüents

| Error                                           | Conseqüència                                              |
| ----------------------------------------------- | --------------------------------------------------------- |
| `up -d` sense aturar la pila antiga             | `address already in use`; mitja pila en marxa             |
| `docker compose down` sense `-p <pila-antiga>`  | No atura la pila vella; el `up` següent falla             |
| Backup amb els scripts nous abans del canvi     | S'atura perquè no troba el contenidor nou                 |
| Desplegar amb `BASE_DOMAIN_URL` sense definir   | `.otrc` silenciosament incorrecte                         |
| Canviar `ENCRYPTION_SECRET`/`JWT_SECRET` al mig | Tracking i bots per reconfigurar; sessions invalidades    |
| `rebase`/`force-push` després de desplegar      | Cal `reset --hard` al servidor                            |
| Pujar la branca sense PR                        | La CI no s'executa                                        |
| Esborrar les imatges antigues massa aviat       | No queda vehicle de rollback                              |
| No renombrar els backups antics                 | La rotació i la comprovació no els veuen                  |
| Assumir un redirect que el proveïdor no permet  | El domini antic deixa de resoldre abans que el nou validi |
| Cancel·lar l'antic abans de tenir `dig` del nou | Finestra més llarga i rollback sense camí fàcil           |

## Fases posteriors típiques

Canvis que toquen estat o dispositius i van en finestes separades:

- **Prefix de tòpics MQTT**: obliga a regenerar ACL, recrear clients i
  redistribuir els `.otrc`.
- **Claus de `localStorage`**: migrar-les amb un helper que llegeixi l'antiga.
- **Fitxer de base de dades**: renombrar-lo alhora que els scripts de
  backup/restore, amb còpia prèvia.
- **Repositori de git**: renombrar-lo des de la web (_Settings → Repository
  name_) o amb `gh repo rename` si hi ha `gh`, `git remote set-url` a cada clon i
  revisió d'enllaços, badges i filtres de CI.
