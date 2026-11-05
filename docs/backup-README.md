# Sistema de Backups Automàtics - TerritoriADF

Sistema complet de còpies de seguretat amb rotació automàtica per al projecte TerritoriADF.

## 📋 Visió General

El sistema de backups està dissenyat per mantenir múltiples punts de restauració amb diferents períodes de retenció:

- **Diari**: Backup del dia anterior
- **Setmanal**: Backup de fa una setmana
- **Mensual**: Backup de fa un mes
- **Semestral**: Backup de fa sis mesos

Tots els backups es guarden comprimits (tar.gz) al directori `backups/` del projecte.

> **Convenció:** `PROJECT_DIR` és la carpeta on viu el repo. Exporta-la una vegada al shell per a les comandes d'aquest document. Els scripts la calculen sols, així que no depèn d'aquesta variable.
>
> ```bash
> export PROJECT_DIR=/ruta/al/repo   # la carpeta on viu el repo
> ```

## 🛠 Scripts Disponibles

### 1. `backup.sh` - Crear Backups

Script principal per crear backups amb gestió automàtica de rotació.

**Ús:**

```bash
./scripts/backup/backup.sh [daily|weekly|monthly|semester]
```

**Funcionalitat:**

- Atura temporalment el contenidor Docker
- Fa checkpoint de SQLite per consolidar el WAL
- Comprimeix tot el directori `back/data/`
- Gestiona la rotació automàtica (manté només l'últim)
- Reinicia el contenidor
- Envia notificació per Telegram (si està configurat)

**Exemple:**

```bash
# Crear un backup diari
./scripts/backup/backup.sh daily
```

### 2. `restore.sh` - Restaurar Backups

Script per restaurar backups existents.

**Ús:**

```bash
./scripts/backup/restore.sh [daily|weekly|monthly|semester] [fitxer_opcional]
```

**Funcionalitat:**

- Llista els backups disponibles
- Permet seleccionar quin restaurar
- Fa una còpia de seguretat de les dades actuals
- Restaura el backup seleccionat
- Reinicia el contenidor

**Exemple:**

```bash
# Restaurar l'últim backup setmanal
./scripts/backup/restore.sh weekly

# Restaurar un backup específic
./scripts/backup/restore.sh daily "$PROJECT_DIR/backups/daily/territoriadf_daily_20260629_030000.tar.gz"
```

**IMPORTANT**: Aquest script és destructiu. Demanarà confirmació abans de procedir.

### 3. `setup-cron.sh` - Configurar Cron Jobs

Script per gestionar la configuració dels cron jobs al servidor.

**Ús:**

```bash
./scripts/backup/setup-cron.sh [install|uninstall|status|test|help]
```

**Comandos:**

- `install`: Instal·la els cron jobs per backups automàtics
- `uninstall`: Desinstal·la els cron jobs
- `status`: Mostra l'estat dels cron jobs i backups existents
- `test`: Executa un backup de prova
- `help`: Mostra l'ajuda

**Programació de backups:**

```
Daily:     Cada dia a les 3:00 AM
Weekly:    Cada diumenge a les 3:30 AM
Monthly:   Cada dia 1 del mes a les 4:00 AM
Semester:  1 de gener i 1 de juliol a les 4:30 AM
```

**Exemple:**

```bash
# Instal·lar backups automàtics
./scripts/backup/setup-cron.sh install

# Verificar estat
./scripts/backup/setup-cron.sh status

# Fer un test
./scripts/backup/setup-cron.sh test
```

### 4. `check-backups.sh` - Verificar Estat

Script per verificar l'estat i integritat dels backups.

**Ús:**

```bash
./scripts/backup/check-backups.sh
```

**Funcionalitat:**

- Verifica l'estat de cada tipus de backup
- Comprova la integritat dels fitxers (tar.gz)
- Mostra informació detallada (mida, data, antiguitat)
- Detecta backups corruptes o massa antics
- Verifica l'espai en disc disponible
- Comprova que els cron jobs estan instal·lats
- Verifica l'estat del contenidor Docker
- Envia notificació per Telegram si hi ha problemes

**Exemple:**

```bash
./scripts/backup/check-backups.sh
```

El script retorna un codi de sortida diferent de 0 si detecta problemes.

## 🚀 Configuració Inicial al Servidor

### Pas 1: Instal·lar Backups Automàtics

```bash
cd "$PROJECT_DIR"
./scripts/backup/setup-cron.sh install
```

Això configurarà els cron jobs per executar backups automàtics segons la programació definida.

### Pas 2: Verificar la Configuració

```bash
./scripts/backup/setup-cron.sh status
```

### Pas 3: Fer un Backup de Prova

```bash
./scripts/backup/setup-cron.sh test
```

Això executarà un backup diari immediatament per verificar que tot funciona correctament.

### Pas 4: Verificar el Primer Backup

```bash
./scripts/backup/check-backups.sh
```

## 📁 Estructura de Directoris

```
$PROJECT_DIR/
├── backups/
│   ├── daily/
│   │   └── territoriadf_daily_20260629_030000.tar.gz
│   ├── weekly/
│   │   └── territoriadf_weekly_20260622_033000.tar.gz
│   ├── monthly/
│   │   └── territoriadf_monthly_20260601_040000.tar.gz
│   ├── semester/
│   │   └── territoriadf_semester_20260101_043000.tar.gz
│   └── backup.log
├── back/
│   └── data/
│       ├── territoriadf.db
│       ├── territoriadf.db-shm
│       ├── territoriadf.db-wal
│       └── ...
└── scripts/
    └── backup/
        ├── backup.sh
        ├── restore.sh
        ├── setup-cron.sh
        └── check-backups.sh
```

## 🔔 Notificacions per Telegram

Per rebre notificacions automàtiques per Telegram, configura les següents variables al fitxer `back/.env`:

```bash
TELEGRAM_BOT_TOKEN=el_teu_bot_token
TELEGRAM_CHAT_ID=el_teu_chat_id
```

Rebràs notificacions quan:

- Un backup es completa correctament ✅
- Un backup falla ❌
- El sistema de verificació detecta problemes ⚠️

## 📊 Logs

Tots els backups automàtics guarden els seus logs a:

```
$PROJECT_DIR/backups/backup.log
```

Per veure els logs en temps real:

```bash
tail -f "$PROJECT_DIR/backups/backup.log"
```

## 🔧 Manteniment

### Verificació Periòdica

Es recomana executar el script de verificació setmanalment de forma manual:

```bash
./scripts/backup/check-backups.sh
```

O afegir-lo com a cron job addicional per monitorització automàtica. Cron no expandeix variables, així que hi ha d'anar la ruta absoluta; la pots obtenir amb:

```bash
(cd "$PROJECT_DIR" && pwd)/scripts/backup/check-backups.sh
```

I afegir-la a `crontab -e` (cada dilluns a les 9:00):

```
0 9 * * 1 <ruta-absoluta>/scripts/backup/check-backups.sh >> <ruta-absoluta>/backups/check.log 2>&1
```

### Espai en Disc

Cada backup complet ocupa aproximadament 5-10MB comprimits. Amb 4 punts de restauració, l'espai total necessari és d'uns 20-40MB.

Si l'espai és limitat, pots:

1. Modificar la política de retenció als scripts
2. Eliminar backups antics manualment
3. Configurar backups remots (rsync, cloud storage)

### Restauració d'Emergència

En cas d'emergència, per restaurar ràpidament:

```bash
# 1. Aturar el contenidor
docker stop territoriadf-backend

# 2. Restaurar el backup
./scripts/backup/restore.sh daily

# 3. Verificar que el contenidor està operatiu
docker ps | grep territoriadf-backend
```

## ⚠️ Consideracions Importants

1. **Els backups aturen temporalment el servei** (uns segons) per garantir la consistència de la base de dades.

2. **La restauració és destructiva**. Sempre fa una còpia de seguretat de les dades actuals abans de restaurar, però confirma que tens la intenció de restaurar.

3. **Els backups són locals**. Per màxima seguretat, considera implementar backups remots addicionals.

4. **SQLite amb WAL**: El sistema consolida el WAL abans de fer el backup per evitar inconsistències.

5. **Permisos**: Els scripts necessiten permisos per aturar/iniciar contenidors Docker i accedir als fitxers de dades.

## 🆘 Resolució de Problemes

### Els cron jobs no s'executen

```bash
# Verificar que estan instal·lats
crontab -l | grep "TerritoriADF Backups"

# Verificar logs del sistema
grep CRON /var/log/syslog | grep territoriadf

# Verificar permisos dels scripts
ls -la "$PROJECT_DIR/scripts/backup/"
```

### El backup falla

```bash
# Verificar logs
tail -n 50 "$PROJECT_DIR/backups/backup.log"

# Verificar que Docker està operatiu
docker ps

# Verificar espai en disc
df -h "$PROJECT_DIR"

# Executar en mode manual per veure errors
./scripts/backup/backup.sh daily
```

### El contenidor no es reinicia després del backup

```bash
# Reiniciar manualment
docker start territoriadf-backend

# Verificar logs del contenidor
docker logs territoriadf-backend

# Verificar que la base de dades no està corrupta
sqlite3 $PROJECT_DIR/back/data/territoriadf.db "PRAGMA integrity_check;"
```

## 📚 Referències

- Documentació SQLite WAL: https://www.sqlite.org/wal.html
- Documentació Docker: https://docs.docker.com/
- Guia de Cron: https://crontab.guru/

---

**Data de creació**: 2026-06-29  
**Autor**: OpenCode  
**Versió**: 1.0
