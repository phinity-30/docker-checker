# 🐳 DockPulse (Docker-Checker)

Ein leichtgewichtiger, eigenständiger Docker-Container mit moderner Web-Oberfläche zum **Auflisten, Inspizieren, Gruppieren und Steuern** aller Docker-Container und Compose-Stacks auf deinem Host.

## ✨ Funktionen

1. **📚 Stacks (Portainer-Style)**:
   - Erkennt automatisch alle `docker-compose`-Stacks über das Label `com.docker.compose.project` (sowie Docker Swarm Stacks).
   - Zeigt den Live-Status (`X/Y aktiv`) jedes Stacks und erlaubt das **gesammelte Starten, Stoppen oder Neustarten** des gesamten Stacks.
2. **📦 Alle Container**:
   - Übersichtsliste aller Container mit Echtzeit-Suche (Name, Image, Stack, Port, IP) und Status-Filter (*Alle / Laufend / Gestoppt*).
   - Klickbare Web-Port-Badges (`↗ :8096`), die den jeweiligen Container-Port direkt im Browser öffnen.
3. **🔗 Container zusammenführen (Eigene Gruppen)**:
   - Wähle beliebige Container per Checkbox `☑️` aus (auch über verschiedene Compose-Stacks hinweg!) und klicke auf **`🔗 Zusammenführen`**.
   - Speichert deine Gruppen dauerhaft in `/app/data/groups.json` anhand der Container-Namen (bleibt auch bei Container-Updates erhalten).
   - Starte, stoppe oder starte komplette eigene Gruppen mit **1 Klick** neu.
4. **📊 Container-Details & Aktionen (Inspector rechts)**:
   - Klick auf einen beliebigen Container öffnet sofort das Detail-Panel rechts:
     - **Aktionen**: `Starten`, `Stoppen`, `Neustart`, `Pause / Fortsetzen`.
     - **Übersicht & Ressourcen**: Live CPU-%, RAM-Verbrauch, Netzwerk-Traffic (RX/TX), Uptime, Restart-Policy, IP-Adresse und **1-Klick-Gruppenzuweisung**.
     - **Live-Logs**: Container-Logs mit Suchfilter und Kopier-Button.
     - **Volumes & Mounts**: Alle gemounteten Host-Pfade und Volumes (`RW` / `RO`).
     - **Environment & Befehl**: Umgebungsvariablen (Passwörter/Keys standardmäßig maskiert, per Klick einblendbar) sowie Entrypoint/Command.

---

## 🚀 Option 1: Direkt in Portainer einfügen (Empfohlen)

Du kannst den kompletten Inhalt der Datei **[`portainer-stack.yml`](./portainer-stack.yml)** direkt in Portainer unter **Stacks $\rightarrow$ + Add stack $\rightarrow$ Web editor** einfügen.
Da dort `build: https://github.com/phinity-30/docker-checker.git#main` hinterlegt ist, lädt und baut Portainer das Image vollautomatisch von GitHub – ganz ohne vorheriges Klonen per SSH!

---

## 🚀 Option 2: Per Terminal & Docker Compose starten

```bash
git clone https://github.com/phinity-30/docker-checker.git
cd docker-checker
docker compose up -d --build
```

Danach im Browser öffnen:
👉 **`http://<deine-server-ip>:3000`**

---

## ⚙️ Alle Konfigurationsmöglichkeiten (Umgebungsvariablen)

| Variable | Standardwert | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | `3000` | Interner HTTP-Port des Containers |
| `TZ` | `Europe/Berlin` | Zeitzone für Log-Zeitstempel |
| `APP_TITLE` | `DockPulse` | Angezeigter Titel oben links im Web-Dashboard |
| `DEFAULT_THEME` | `dark` | Standard-Farbschema (`dark` oder `light`) |
| `DEFAULT_VIEW` | `stacks` | Start-Tab beim Öffnen (`stacks`, `all` oder `groups`) |
| `AUTO_REFRESH_SECONDS` | `4` | Live-Aktualisierungsintervall in Sekunden |
| `LOG_TAIL_LINES` | `150` | Anzahl der geladenen Log-Zeilen pro Container |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Pfad zum gemounteten Docker-Socket |
| `DOCKER_HOST` | *(leer)* | Optional: Remote Docker-API via TCP (z. B. `tcp://192.168.1.50:2375`) |
| `DATA_DIR` | `/app/data` | Speicherort für zusammengeführte Gruppen (`groups.json`) |
| `DEMO_MODE` | `false` | Auf `true` setzen, um den Demo-Simulationsmodus zu erzwingen |
| `BASIC_AUTH_USER` | *(leer)* | Optional: Benutzername für HTTP Basic Auth Passwortschutz |
| `BASIC_AUTH_PASS` | *(leer)* | Optional: Passwort für HTTP Basic Auth Passwortschutz |
