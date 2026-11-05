# 1B — Pla del canvi de domini

> **Temporal.** Dades reals d'aquesta migració; s'esborra abans del merge.
> Els passos genèrics i el perquè són a [`../MIGRATION.md`](../MIGRATION.md).

## Com s'executa

Les comandes es fan amb l'usuari que desplega l'aplicació (`deployuser`), que
**no té sudo**. El que toca `/etc/nginx`, `/etc/letsencrypt` o `/root` va marcat
**Root** i es fa en una sessió de root (`su -`), sense `sudo` al davant.

La carpeta del repo no és fixa (els scripts la calculen). Les comandes d'aquest
pla la fan servir, així que defineix-la a cada shell:

```bash
export PROJECT_DIR=/var/www/hidrants      # la carpeta del repo al servidor
```

La sessió de root és un shell nou i també la necessita:
`export PROJECT_DIR=/var/www/hidrants`.

## Dades

| Cosa             | Valor                                                                |
| ---------------- | -------------------------------------------------------------------- |
| Domini en servei | `hidrants.hopto.org` (DDNS gratuït de No-IP; confirmar cada 30 dies) |
| Domini nou       | `territoriadf.hopto.org`                                             |
| Redirect         | **No** — l'antic s'ha de cancel·lar abans de crear el nou            |
| Branca           | `60-migracio-nom-aplicacio`                                          |
| Commit desplegat | `f4fbd59`                                                            |
| Pila en marxa    | `territoriadf-{backend,frontend,mosquitto}`                          |
| Finestra         | per fixar; és un **tall net** amb parada real, no un canvi en calent |

## Què implica no poder mantenir l'antic

- **No hi ha redirect ni doble servei.** Quan es cancel·la `hidrants.hopto.org`,
  ningú hi pot arribar: ni la UI, ni el `.otrc`, ni el webhook de Telegram.
- **Ordre obligat**: cancel·lar l'antic → crear el nou → esperar DNS → certificat.
  Abans de la cancel·lació no es pot validar el certificat nou perquè el nom encara
  no existeix.
- **Parada estimada**: 15–40 min (cancel·lació + propagació del DDNS + HTTP-01 de
  Let's Encrypt). Si No-IP triga a propagar, s'allarga.
- **Rollback de domini és limitat**: dependrà de poder tornar a crear el nom antic
  al mateix compte. Per això tot el que es pugui preparar abans, es prepara abans.
- Els dispositius no podran publicar fins que tinguin el `.otrc` nou, perquè el
  host antic deixarà de resoldre (les credencials MQTT no canvien).

> Comprova abans si el teu pla de No-IP permet dos hostnames alhora. Si els
> permet, fes-ho a l'inrevés (crear el nou, validar-lo i només llavors cancel·lar
> l'antic): la parada baixa a un `reload` de nginx. El pla per defecte aquí és el
> tall net.

## Preparar-ho tot abans de tocar res (T-1d)

**Usuari que desplega:**

```bash
cd "$PROJECT_DIR"
git status --short                              # arbre net
docker compose ps                               # pila territoriadf en marxa
grep -E '^(BASE_DOMAIN_URL|OTRC_HOST)=' back/.env
cp -p back/.env back/.env.pre-1B && chmod 600 back/.env.pre-1B
./scripts/backup/backup.sh daily
```

**Root** — el que serveix avui és `/etc/nginx/sites-enabled/hidrants`, i és un
**fitxer normal**, no un enllaç a `sites-available`. A `sites-available` hi ha
tres fitxers amb el domini, però cap és el que nginx llegeix: `default` té els
blocs que certbot va afegir per als subdominis (`piera`,
`els-hostalets-de-pierola`, `masquefa`), i `hidrants.pm2` és una còpia de
l'etapa PM2. Desa el fitxer de `sites-enabled` i apunta'n el camí, perquè el
rollback l'ha de tornar al mateix lloc.

> El lloc vell també serveix subdominis per municipi
> (`server_name .hidrants.hopto.org` + regex): això **no** es manté. El lloc nou
> (plantilla) només respon per `territoriadf.hopto.org`; si algun dia calen
> subdominis, és una fase a part amb certificat wildcard.

```bash
ls -l /etc/nginx/sites-enabled/          # hidrants, fitxer normal (-rw-r--r--)
SITE=/etc/nginx/sites-enabled/hidrants
grep -n 'server_name' "$SITE"            # ha de dir hidrants.hopto.org
ls -l /etc/nginx/sites-enabled/ > /root/nginx-enabled-pre-1B.txt
echo "$SITE" > /root/nginx-site-actual.txt
cp -p "$SITE" /root/site-pre-1B.nginx
nginx -T | grep -E 'server_name|ssl_certificate '
```

A la mà, perquè no calgui pensar-hi dins la finestra:

- `.env` amb `BASE_DOMAIN_URL=territoriadf.hopto.org` i sense `OTRC_HOST`, llest per
  copiar.
- Nom i còpia del lloc de nginx actual
  (`/etc/nginx/sites-enabled/hidrants` → `/root/nginx-site-actual.txt` i
  `/root/site-pre-1B.nginx`), més la llista de `sites-enabled` de partida
  (`/root/nginx-enabled-pre-1B.txt`): és el que es restaura al rollback.
- IP pública del servidor confirmada (`curl -4 ifconfig.me`).
- Certificat antic localitzat: `/etc/letsencrypt/live/hidrants.hopto.org/` (no
  s'esborra fins al cap d'uns dies).
- Avis als usuaris per Telegram, amb l'hora de tall i què han de fer després
  (tornar a entrar i descarregar el `.otrc`).

## Passos

### 1. Avis i inici de la finestra

Missatge als grups de Telegram de cada ADF: «a partir de les HH:MM el domini
`hidrants.hopto.org` deixa de funcionar; feu servir `territoriadf.hopto.org` i
torneu a descarregar el fitxer de configuració».

### 2. Cancel·lar l'antic i crear el nou a No-IP

1. Al panell de No-IP: suprimir `hidrants.hopto.org`.
2. Crear `territoriadf.hopto.org` (tipus A) apuntant a la IP del servidor.
3. Confirmar l'alta per correu si ho demana.

```bash
dig +short territoriadf.hopto.org      # ha de respondre la IP pública
dig +short hidrants.hopto.org          # ha de quedar buit
```

Prova-ho també des d'una xarxa externa o un resolutor públic
(`dig @1.1.1.1 +short territoriadf.hopto.org`): la caché negativa del DDNS pot
trigar uns minuts.

- **Client DDNS**: si la IP la manté un client (DUC de No-IP, `ddclient` o el
  router), canvia-li el nom pel nou en aquest mateix moment. Si continua enviant
  actualitzacions de l'antic, el pot recrear o deixar el nou sense IP.

### 3. Bloc temporal HTTP per validar el certificat

**Root.** El lloc actual té `server_name hidrants.hopto.org`; cal un bloc que
respongui pel nom nou mentre encara no hi ha certificat.

```bash
tee /etc/nginx/sites-available/territoriadf-acme >/dev/null <<'EOF'
server {
    listen 80;
    server_name territoriadf.hopto.org;
    location /.well-known/acme-challenge/ { root /var/www/html; }
}
EOF
ln -sfn /etc/nginx/sites-available/territoriadf-acme /etc/nginx/sites-enabled/territoriadf-acme
nginx -t && systemctl reload nginx
```

### 4. Certificat

**Root.**

```bash
certbot certonly --nginx -d territoriadf.hopto.org --dry-run
certbot certonly --nginx -d territoriadf.hopto.org
ls /etc/letsencrypt/live/territoriadf.hopto.org/
```

Comprova que el hook de desplegament continua enllaçat (copia els certificats a
Mosquitto): `ls /etc/letsencrypt/renewal-hooks/deploy/`.

### 5. `back/.env`

```env
BASE_DOMAIN_URL=territoriadf.hopto.org
#OTRC_HOST=      # esborrat: es derivava de BASE_DOMAIN_URL
```

No tocar `JWT_SECRET`, `ENCRYPTION_SECRET`, `MQTT_*_PASSWORD` ni els tokens de
Telegram/OSM.

### 6. Nginx del host

**Usuari que desplega** — genera el fitxer al repo:

```bash
cd "$PROJECT_DIR"
npm run nginx:render
```

**Root** — instala'l i retira el vell:

```bash
cd "$PROJECT_DIR"
# config/site-docker.nginx l'acaba de gener un altre usuari; és sortida, no es
# versiona (`config/*.nginx` és a .gitignore), així que no cal committar-la
cp config/site-docker.nginx /etc/nginx/sites-available/territoriadf
ln -sfn /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf

# Treure el lloc vell i el bloc temporal. El vell és un fitxer normal a
# sites-enabled (no un enllaç): si hi queda, nginx continua servint el
# server_name antic amb el seu certificat i el grep de verificació falla.
rm -f /etc/nginx/sites-enabled/hidrants
rm -f /etc/nginx/sites-enabled/territoriadf-acme \
      /etc/nginx/sites-available/territoriadf-acme
ls -l /etc/nginx/sites-enabled/      # només territoriadf, i com a enllaç
                                     # territoriadf -> sites-available/territoriadf
nginx -t && systemctl reload nginx
```

`config/site-docker.nginx` és sortida de la plantilla (`__APP_DOMAIN__` →
`BASE_DOMAIN_URL`): no s'edita a mà. Com que el domini antic desapareix, no hi ha
bloc de redirect.

### 7. Backend

```bash
docker compose up -d --force-recreate backend
curl -fsS https://territoriadf.hopto.org/api/config
```

Sense recrear-lo, el backend segueix amb el domini vell a `BASE_DOMAIN_URL` i el
`.otrc` sortiria amb `hidrants.hopto.org`.

### 8. Mosquitto

```bash
bash scripts/copy-mosquitto-certs.sh
```

Copia els certificats del domini nou a `mosquitto/certs/`, ajusta permisos i
reinicia el broker. Si no es fa, el port 51823 presenta el certificat de
`hidrants.hopto.org` i els clients nous fallen.

### 9. Telegram i OSM

- **Telegram**: el webhook està registrat amb `hidrants.hopto.org`. Re-registra el
  bot de cada ADF des de _Configuració → Notificacions de Telegram_ i comprova:
  ```bash
  curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo" | grep url
  ```
- **OSM**: canvia l'URI de redirecció a
  <https://www.openstreetmap.org/oauth2/applications> pel domini nou. El token
  `OSM_ACCESS_TOKEN` no caduca.

### 10. Usuaris i dispositius

- Tothom ha de tornar a entrar: la cookie de sessió és host-only i el host antic
  ja no resol.
- Tothom ha de tornar a descarregar el `.otrc` (ara `host: territoriadf.hopto.org`)
  i reimportar-lo a OwnTracks. Les credencials MQTT no canvien.

## Verificació

**Usuari que desplega:**

```bash
cd "$PROJECT_DIR"
dig +short territoriadf.hopto.org
docker compose ps
curl -fsS https://territoriadf.hopto.org/api/config
curl -fsS -o /dev/null -w '%{http_code}\n' https://territoriadf.hopto.org/
openssl s_client -connect territoriadf.hopto.org:51823 -servername territoriadf.hopto.org </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

- [ ] `dig` respon la IP del servidor des de dins i des de fora.
- [ ] HTTPS vàlid, sense avisos, amb `subject` del domini nou.
- [ ] Login correcte; mapa, hidrants i incidències amb dades.
- [ ] `.otrc` descarregat amb `host: territoriadf.hopto.org`, `port: 51823`, `tls: true`.
- [ ] Una unitat amb el `.otrc` nou publica i es veu al mapa.
- [ ] `getWebhookInfo` amb `territoriadf.hopto.org` i missatge de prova al grup.
- [ ] `./scripts/backup/check-backups.sh` verd (`territoriadf_*`).
- [ ] Logs sense errors de broker ni de certificat.
- [ ] Cap referència a `hidrants.hopto.org` al `.env` ni a nginx:
      `grep -rn hidrants.hopto.org back/.env` buit i, **com a root**,
      `grep -l 'hidrants.hopto.org' /etc/nginx/sites-enabled/*` buit. Els
      fitxers que quedin a `sites-available` (`default`, `hidrants`,
      `hidrants.pm2`) són innocus mentre no siguin a `sites-enabled`.
- [ ] `ls -l /etc/nginx/sites-enabled/` mostra només `territoriadf` i **com a
      enllaç** a `../sites-available/territoriadf` (no una còpia): el que es
      manté al dia és el de `sites-available`.
- [ ] Cap subdomini per municipi: `dig +short piera.hidrants.hopto.org` buit i el
      domini nou no n'ha d'oferir cap (decisió presa: fora subdominis).

## Rollback

El domini és el punt feble d'aquest pla: un cop cancel·lat, no hi ha camí
automàtic enrere. Si alguna cosa falla **i cal tornar enrere**:

**Usuari que desplega:**

```bash
cd "$PROJECT_DIR"

# 1. Recrear hidrants.hopto.org a No-IP (si el compte ho permet) i esperar el dig
dig +short hidrants.hopto.org

# 2. Tornar el .env
cp -p back/.env.pre-1B back/.env
```

**Root — 3. Tornar el lloc de nginx al seu lloc original.** El vell era un
fitxer normal a `sites-enabled`, així que es restaura igual; el nou
`territoriadf`, que sí que és enllaç, s'esborra sencer:

```bash
SITE=$(cat /root/nginx-site-actual.txt)     # /etc/nginx/sites-enabled/hidrants
cp -p /root/site-pre-1B.nginx "$SITE"       # torna a ser un fitxer normal
rm -f /etc/nginx/sites-enabled/territoriadf /etc/nginx/sites-enabled/territoriadf-acme
cat /root/nginx-enabled-pre-1B.txt          # el que hi havia abans, per si cal
nginx -t && systemctl reload nginx
```

**Usuari que desplega — 4 i 5:**

```bash
# 4. Backend i broker amb el domini antic
docker compose up -d --force-recreate backend
bash scripts/copy-mosquitto-certs.sh

# 5. Telegram: re-registrar el bot amb hidrants.hopto.org
```

El certificat antic continua a `/etc/letsencrypt/live/hidrants.hopto.org/`: no
l'esborris fins que la 1B porti uns dies estable. Si No-IP no permet recuperar el
nom, l'alternativa és tirar endavant amb el nou i corregir el que falli.

La **fase 1 (pila `territoriadf`) no es toca** en cap rollback d'aquesta fase: el
domini és només una variable.

## Tancament

1. Verificacions completes i 24 h d'observació.
2. Esborrar l'expedient: `git rm -r docs/migracio` al mateix commit de tancament.
   Comprova abans que sigui a git (`git ls-files docs/migracio docs/MIGRATION.md`):
   si encara no hi és, `git rm` falla i primer cal `git add` (o `rm -rf` si no
   s'ha de conservar).
3. Treure el PR de draft i fusionar a `main` des de la web
   (<https://github.com/tonikny/hidrants/pulls>): no hi ha `gh` instal·lat al
   servidor.
4. Al servidor:
   ```bash
   git switch main && git pull --ff-only
   npm run docker:deploy -- --dry-run
   npm run docker:deploy
   ```
5. Neteja, amb l'usuari que desplega: `docker image prune -f` (les imatges
   `hidrants-*` ja no calen) i esborrar `back/.env.pre-1B`. I **com a root**, al
   cap d'uns dies: `/root/site-pre-1B.nginx`, `/root/nginx-site-actual.txt` i
   `certbot delete --cert-name hidrants.hopto.org`.
6. Fases posteriors: renombrar el repositori, prefix MQTT, claus de
   `localStorage`, `hidrants.db`.

## Prompt per a la propera sessió

> Executa la fase 1B descrita a `docs/migracio/1B-pla-domini.md`: tall net de
> `hidrants.hopto.org` a `territoriadf.hopto.org`, sense redirect. L'usuari que
> desplega no té sudo: els passos de nginx i certbot es fan en una sessió de
> root, i `PROJECT_DIR` s'exporta a cada shell. Comença
> comprovant l'estat de partida i el que cal preparar abans de cancel·lar el nom
> antic, i no facis el merge a `main` fins que totes les verificacions passin. En
> tancar, esborra `docs/migracio/`.
