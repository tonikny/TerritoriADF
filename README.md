# TerritoriADF

_Gestió d'hidrants d'incendis per a les ADF (Agrupacions de Defensa Forestal)_

## Descripció

Aquesta aplicació permet a les ADFs gestionar i visualitzar la xarxa d'hidrants del seu territori. És una eina pensada per tenir el control de les dades de forma independent, facilitant la revisió i el manteniment dels punts d'aigua, el seguiment d'incidències i la localització de les unitats en temps real.

## Característiques

- **Arquitectura SPA**: Aplicació de pàgina única, amb suport per a múltiples ADFs, cadascuna amb un o diversos municipis assignats.
- **Dades geogràfiques per ADF**: Les fronteres (GeoJSON), l'BBOX i el center es desen directament a la taula `adfs`, sense dependre de municipis individuals.
- **Sincronització amb OSM**: Importació i exportació bidireccional de dades amb OpenStreetMap (pull sync, push sync, exportació .osc).
- **Validació de dades**: Abans de pujar a OSM, el backend valida els tags contra valors permesos (tipus, posició, acoblaments, diàmetres, dates; la pressió s'accepta en qualsevol format). Dades invàlides → error; warnings (majuscules, valors no estàndard) → revisió pendent.
- **Gestió d'incidències**: Registre i seguiment d'incidències associades als hidrants.
- **Tracking en temps real (MQTT/OwnTracks)**: Recepció d'ubicacions GPS de les unitats per conèixer-ne la posició sobre el mapa.
- **Notificacions Telegram per ADF**: Cada ADF pot tenir el seu bot i un grup de Telegram on rep automàticament els avisos (incidències, altes i edicions d'hidrants). Configuració guiada des de la pestanya **Configuració → Notificacions de Telegram**: token xifrat, deep link `startgroup` d'un sol ús i avís de prova directament al grup.
- **Seguretat**: Sessions amb JWT i control d'accés per rols; el backend és resilient i funciona encara que Mosquitto no estigui disponible.
- **Mapa interactiu**: Basat en Leaflet amb suport per a:
  - Visualització de límits territorials.
  - Creació i edició d'hidrants locals.
  - Vista d'imatges des d'URLs incloses a OSM.
  - Llista detallada d'hidrants i cerca ràpida.
  - Càlcul de rutes a hidrants mitjançant GraphHopper.
  - URLs compartibles per a la localització exacta de cada hidrant.
- **Exportació OSM**: Exportació de canvis en format .osc (OSM XML) compatible amb JOSM per importar manualment a OpenStreetMap.
- **Backups automàtics**: Sistema complet de còpies de seguretat de la base de dades amb rotació (diària, setmanal, mensual i semestral).

## Stack Tecnològic

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Leaflet, React Leaflet.
- **Backend**: Fastify 5, TypeScript, Drizzle ORM, Zod.
- **Base de dades**: SQLite (Better-SQLite3).
- **Messaging**: Eclipse Mosquitto 2 (MQTT) + OwnTracks.
- **Infraestructura**: Docker, Docker Compose, Nginx, GraphHopper.

## 🗺️ Sincronització amb OpenStreetMap

La sincronització OSM és una funcionalitat accessible únicament per **administradors**, permetent mantenir les dades locals sincronitzades amb OpenStreetMap de forma bidireccional.

### Estats de Sincronització 📊

| Estat                 | Emoji | Descripció                  | Accions                       |
| --------------------- | ----- | --------------------------- | ----------------------------- |
| ✅ **SYNCED**         | ✅    | Sincronitzat amb OSM        | Edició normal, pujar canvis   |
| 🟡 **PENDING_CREATE** | 🟡    | Nou hidrant per crear a OSM | Push sync, pujar manual       |
| 🔶 **PENDING_UPDATE** | 🔶    | Canvi local per pujar a OSM | Push sync, pujar manual       |
| 🔴 **PENDING_DELETE** | 🔴    | Marcat per esborrar de OSM  | Push sync, esborrar manual    |
| ⚠️ **CONFLICT**       | ⚠️    | Conflicte de versió amb OSM | Resoldre, descartar, pujar    |
| ❌ **ERROR**          | ❌    | Error en la sincronització  | Repetir, netejar errors       |
| 🔍 **REVIEW**         | 🔍    | Revisió manual necessària   | Acceptar, corregir, descartar |

### Fluxos d'Operacions

#### 🔄 Pull Sync (Importar dades d'OSM)

Importa hidrants des d'OpenStreetMap cap a la base de dades local:

- Respecta els estats locals (`PENDING_CREATE`, `PENDING_UPDATE/DELETE` no es sobreescriuen)
- Detecta conflictes si OSM té versions més noves
- Netega hidrants eliminats a OSM (només si `SYNCED`)

#### 📤 Push Sync (Exportar canvis a OSM)

Exporta els canvis pendents cap a OpenStreetMap:

- Crea actualitza i esborra nodes a OSM
- Gestiona conflictes de versió (409)
- Valida dades abans de pujar
- Notifica conflictes via Telegram

### Documentació Detallada

Per a configuració completa, gestió d'errors, resolució de conflictes i casos d'ús detallats, consulta:

📖 **[docs/OSM_SYNC.md](docs/OSM_SYNC.md)** - Documentació completa de sincronització OSM

## Instal·lació i Ús

### Entorn de Desenvolupament

Per desenvolupar localment cal configurar les variables d'entorn del backend i de Mosquitto, inicialitzar la base de dades i aixecar el broker MQTT. Per a tot el procés pas a pas, consulta [docs/DEV.md](docs/DEV.md).

### Deploy amb Docker

Per a producció, el projecte s'orquestra amb Docker Compose (frontend servit per Nginx, backend i broker Mosquitto). El desplegament automatitzat actualitza el codi, les dependències i la base de dades. La guia completa, inclosa la configuració MQTT amb certificats i els backups automàtics, es troba a [docs/DEPLOY.md](docs/DEPLOY.md).

---

_Projecte creat per Toni, ADF 278 Els Hostalets de Pierola._
