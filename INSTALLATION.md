# 📦 Installation auf lokalem Server (192.168.1.138)

## Schritt-für-Schritt Anleitung

### ✅ Voraussetzungen prüfen

```bash
# Node.js installiert?
node --version  # Sollte >= 18.x sein

# npm installiert?
npm --version

# Git installiert?
git --version
```

Falls Node.js fehlt:
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# oder via nvm (empfohlen)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

---

## 🚀 Installation

### 1. Repository klonen

```bash
# SSH zu deinem lokalen Server
ssh administrator@192.168.1.138

# In ein passendes Verzeichnis wechseln
cd /opt  # oder ~/apps oder wo auch immer

# Repository klonen
git clone https://github.com/jdkmzhn/ticket-local.git
cd ticket-local
```

### 2. Dependencies installieren

```bash
npm install
```

Das installiert:
- `express` - Web-Server
- `axios` - HTTP-Client  
- `cors` - Cross-Origin Requests
- `pdf-parse` - PDF-Text-Extraktion
- `mammoth` - Word-Dokument-Verarbeitung
- `multer` - File-Uploads

### 3. Konfiguration erstellen

```bash
cp env.example .env
nano .env
```

Passe die `.env` an:
```env
# Lokale KI (läuft vermutlich auf Port 8080)
LOCAL_AI_URL=http://localhost:8080
LOCAL_AI_API_KEY=sk-dein-actual-key-hier
LOCAL_AI_MODEL=llama3.3:70b

# Zammad
ZAMMAD_API_URL=https://support.kmzhn.de
ZAMMAD_API_TOKEN=dein-actual-token-hier

# Server Port (3000 ist standard)
PORT=3000
```

### 4. Erster Test

```bash
npm start
```

Du solltest sehen:
```
🚀 Zammad KI-Integration Server läuft auf Port 3000
📱 Öffne http://localhost:3000 im Browser
```

**Testen im Browser:**
- Lokal auf Server: `http://localhost:3000`
- Von anderem PC im Netzwerk: `http://192.168.1.138:3000`

---

## 🔧 Als Systemd Service einrichten (automatischer Start)

### Service-Datei erstellen

```bash
sudo nano /etc/systemd/system/zammad-ki-local.service
```

Inhalt:
```ini
[Unit]
Description=Zammad KI Integration - Local Privacy Edition
After=network.target

[Service]
Type=simple
User=administrator
WorkingDirectory=/opt/ticket-local
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=10

# Environment Variables
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### Service aktivieren und starten

```bash
# Service neu laden
sudo systemctl daemon-reload

# Service aktivieren (startet beim Booten)
sudo systemctl enable zammad-ki-local

# Service starten
sudo systemctl start zammad-ki-local

# Status prüfen
sudo systemctl status zammad-ki-local

# Logs ansehen
sudo journalctl -u zammad-ki-local -f
```

### Service-Management

```bash
# Service stoppen
sudo systemctl stop zammad-ki-local

# Service neu starten
sudo systemctl restart zammad-ki-local

# Service deaktivieren (nicht mehr beim Booten starten)
sudo systemctl disable zammad-ki-local
```

---

## 🌐 Zugriff von außen (über VPN)

### Option 1: WireGuard VPN (empfohlen)

Wenn du bereits WireGuard VPN hast:
- Einfach VPN verbinden
- Dann: `http://192.168.1.138:3000`

### Option 2: Tailscale (noch einfacher)

```bash
# Tailscale installieren
curl -fsSL https://tailscale.com/install.sh | sh

# Einloggen und verbinden
sudo tailscale up

# Zeigt dir deine Tailscale-URL:
tailscale ip -4
```

Dann erreichbar über:
- `http://<machine-name>.tail-scale-name.ts.net:3000`
- Oder über die Tailscale-IP

---

## 🔄 Updates installieren

```bash
cd /opt/ticket-local

# Aktuellen Code pullen
git pull origin main

# Dependencies aktualisieren
npm install

# Service neu starten
sudo systemctl restart zammad-ki-local
```

---

## 🐛 Troubleshooting

### Port 3000 bereits belegt?

```bash
# Port ändern in .env
echo "PORT=3001" >> .env

# Service neu starten
sudo systemctl restart zammad-ki-local
```

### Open WebUI nicht erreichbar?

```bash
# Prüfe ob Open WebUI läuft
curl http://localhost:8080/api/health

# Falls nicht, prüfe den Port
netstat -tulpn | grep 8080
```

### Logs ansehen

```bash
# Live-Logs
sudo journalctl -u zammad-ki-local -f

# Letzte 100 Zeilen
sudo journalctl -u zammad-ki-local -n 100

# Logs seit heute
sudo journalctl -u zammad-ki-local --since today
```

### Permission-Fehler

```bash
# Rechte korrigieren
sudo chown -R administrator:administrator /opt/ticket-local
```

---

## ✅ Fertig!

Die App läuft jetzt auf:
- **Lokal**: `http://localhost:3000`
- **Im Netzwerk**: `http://192.168.1.138:3000`
- **Via VPN**: `http://192.168.1.138:3000` (über VPN-Verbindung)

**Alle Daten bleiben zu 100% lokal** - keine Cloud-Verarbeitung! 🔒

