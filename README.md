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

## 🚀 Starten als Docker-Container (Empfohlen für Server / NAS / Linux)

Im Projektordner einfach per Docker Compose bauen und starten:

```bash
docker compose up -d --build
```

Danach im Browser öffnen:
👉 **`http://<deine-server-ip>:3000`**

---

## 💻 Lokal testen (ohne Docker / unter Windows)

Falls auf deinem aktuellen PC kein Docker läuft, schaltet die App automatisch in einen **interaktiven Demo-Simulationsmodus**, sodass du alle Funktionen direkt lokal ausprobieren kannst:

```bash
node src/server.js
```

Danach im Browser öffnen:
👉 **`http://localhost:3000`**
