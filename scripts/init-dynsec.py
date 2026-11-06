#!/usr/bin/env python3
"""
Gestió de dynamic-security.json per Mosquitto Dynamic Security plugin.
Copy to scripts/init-dynsec.py on server if needed.

Usage:
  python3 scripts/init-dynsec.py regen   # destructiu: regenera admin+backend, esborra clients d'usuari
  python3 scripts/init-dynsec.py sync    # no destructiu: actualitza admin+backend, conserva clients d'usuari

Carrega MQTT_ADMIN_PASSWORD, MQTT_BACKEND_PASSWORD i MQTT_TOPIC_PREFIX des de back/.env.
"""
import json, subprocess, os, sys

MOSQUITTO_IMAGE = "eclipse-mosquitto:2"
PROJECT_DIR = os.environ.get("PROJECT_DIR", os.getcwd())
CONFIG_FILE = os.path.join(PROJECT_DIR, "mosquitto/data/dynamic-security.json")
ENV_FILE = os.path.join(PROJECT_DIR, "back/.env")

def load_back_env() -> None:
    if not os.path.exists(ENV_FILE):
        print(f"ERROR: no trobo {ENV_FILE}", file=sys.stderr)
        sys.exit(1)
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

def gen_hash(password: str) -> str:
    result = subprocess.run(
        ["docker", "run", "--rm", "-i", MOSQUITTO_IMAGE, "sh", "-c",
         "cat > /tmp/pw && mosquitto_passwd -U /tmp/pw 2>/dev/null && cat /tmp/pw"],
        input=f"u:{password}\n",
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip().split(":", 1)[1]

def run(*cmd) -> None:
    subprocess.run(cmd, cwd=PROJECT_DIR, check=True)

def creds():
    admin_user = os.environ.get("MQTT_ADMIN_USERNAME", "admin")
    backend_user = os.environ.get("MQTT_BACKEND_USERNAME", "backend")
    admin_pass = os.environ.get("MQTT_ADMIN_PASSWORD", "")
    backend_pass = os.environ.get("MQTT_BACKEND_PASSWORD", "")
    if not admin_pass or not backend_pass:
        print("ERROR: cal MQTT_ADMIN_PASSWORD i MQTT_BACKEND_PASSWORD a back/.env", file=sys.stderr)
        sys.exit(1)
    return admin_user, admin_pass, backend_user, backend_pass, os.environ.get("MQTT_TOPIC_PREFIX", "owntracks/territoriadf")

def base_config():
    admin_user, admin_pass, backend_user, backend_pass, prefix = creds()
    admin_hash = gen_hash(admin_pass)
    backend_hash = gen_hash(backend_pass)
    return {
        "clients": [
            {"username": admin_user, "textName": "Dynsec admin user", "encoded_password": admin_hash, "roles": [{"rolename": "admin"}]},
            {"username": backend_user, "textName": "Backend service", "encoded_password": backend_hash, "roles": [{"rolename": "backend-service"}]},
        ],
        "roles": [
            {"rolename": "owntracks-device", "acls": [{"acltype": "publishClientSend", "topic": f"{prefix}/%u/#", "allow": True}]},
            {"rolename": "backend-service", "acls": [
                {"acltype": "subscribePattern", "topic": f"{prefix}/#", "allow": True},
                {"acltype": "publishClientSend", "topic": "$CONTROL/dynamic-security/v1", "allow": True},
                {"acltype": "publishClientReceive", "topic": "$CONTROL/dynamic-security/v1/#", "allow": True},
                {"acltype": "subscribePattern", "topic": "$CONTROL/dynamic-security/v1/#", "allow": True},
            ]},
        ],
        "defaultACLAccess": {
            "publishClientSend": False,
            "publishClientReceive": True,
            "subscribe": False,
            "unsubscribe": True,
        },
    }

def confirm(prompt: str) -> bool:
    return input(prompt).strip().lower() in ("y", "yes")

def perm_error() -> None:
    print("ERROR: sense accés a mosquitto/data/dynamic-security.json.", file=sys.stderr)
    print("  Configura l'accés compartit (una sola vegada):", file=sys.stderr)
    print("    sudo groupadd --force mosquitto", file=sys.stderr)
    print("    sudo usermod -a -G mosquitto <el_teu_usuari>", file=sys.stderr)
    print("    sudo chown -R root:mosquitto mosquitto/data   # o 1883:mosquitto si el contenidor corre com a 1883", file=sys.stderr)
    print("    sudo chmod 2770 mosquitto/data", file=sys.stderr)
    print("    sudo chmod 660 mosquitto/data/dynamic-security.json mosquitto/data/mosquitto.db", file=sys.stderr)
    print("    sudo setfacl -d -m g:mosquitto:rw mosquitto/data", file=sys.stderr)
    print("    sudo setfacl -m g:mosquitto:rw mosquitto/data/dynamic-security.json mosquitto/data/mosquitto.db", file=sys.stderr)
    print("  Després entra amb sessió nova (o 'newgrp mosquitto') i torna a executar.", file=sys.stderr)
    sys.exit(1)

def write_config(config) -> None:
    try:
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
    except PermissionError:
        perm_error()
    print(f"Fet: {CONFIG_FILE}")

def cmd_regen() -> None:
    print("AVÍS: REGEN regenera dynamic-security.json des de zero.")
    print("  - Esborra TOTS els clients d'usuari MQTT (dispositius OwnTracks).")
    print("  - Els usuaris hauran de re-activar el tracking a la UI per reconnectar.")
    print("  - admin i backend es recrearan amb les contrasenyes de back/.env.")
    if not confirm("Continuar? [y/N]: "):
        print("Cancel·lat.")
        return
    run("docker", "compose", "stop", "mosquitto")
    if os.path.exists(CONFIG_FILE):
        os.remove(CONFIG_FILE)
    write_config(base_config())
    run("docker", "compose", "start", "mosquitto")

def cmd_sync() -> None:
    existing = None
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                existing = json.load(f)
        except PermissionError:
            perm_error()
    admin_user, _, backend_user, _, _ = creds()
    run("docker", "compose", "stop", "mosquitto")
    base = base_config()
    if existing:
        names = {admin_user, backend_user}
        config = existing
        config["clients"] = [c for c in existing["clients"] if c["username"] not in names] + base["clients"]
        config["roles"] = [r for r in existing["roles"] if r["rolename"] != "backend-reader"]
        for r in base["roles"]:
            if not any(x["rolename"] == r["rolename"] for x in config["roles"]):
                config["roles"].append(r)
    else:
        config = base
    write_config(config)
    run("docker", "compose", "start", "mosquitto")

def main() -> None:
    load_back_env()
    mode = sys.argv[1] if len(sys.argv) > 1 else "regen"
    if mode == "regen":
        cmd_regen()
    elif mode == "sync":
        cmd_sync()
    else:
        print(f"Ús: {sys.argv[0]} [regen|sync]", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
