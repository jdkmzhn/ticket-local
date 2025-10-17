# 🔒 Zammad KI-Integration - Local Privacy Edition

**100% Datenschutzkonforme Lösung für sensible/personenbezogene Daten**

Diese Version läuft **komplett lokal** auf deinem eigenen Server - keine Datenverarbeitung in der Cloud!

---

## 🎯 Unterschiede zur Cloud-Version

| Feature | Cloud-Version | Local-Version |
|---------|---------------|---------------|
| **Hosting** | Hetzner Cloud | Lokaler Server (192.168.1.138) |
| **Datenverarbeitung** | Auf Hetzner-Server | Nur lokal |
| **KI-Verarbeitung** | Lokale KI via SSH-Tunnel | Direkte lokale KI |
| **Dokument-Upload** | Via Hetzner | Lokal verarbeitet |
| **Zugriff** | Internet (HTTPS) | Lokales Netzwerk / VPN |
| **Datenschutz** | Gut | Maximal (DSGVO-konform) |

---

## 🚀 Installation auf lokalem Server

### Voraussetzungen
- **Node.js 18+** auf lokalem Server installiert
- **Open WebUI** (bereits vorhanden auf 192.168.1.138)
- **Zammad-Instanz** erreichbar

### Schritt 1: Repository klonen
```bash
cd /pfad/zu/deinem/server
git clone https://github.com/jdkmzhn/ticket-local.git
cd ticket-local
```

### Schritt 2: Dependencies installieren
```bash
npm install
```

### Schritt 3: Konfiguration
Erstelle `.env` Datei:
```bash
cp env.example .env
```

Bearbeite `.env`:
```env
# Lokale KI (Open WebUI)
LOCAL_AI_URL=http://localhost:8080
LOCAL_AI_API_KEY=dein_api_key

# Zammad API
ZAMMAD_API_URL=https://support.kmzhn.de
ZAMMAD_API_TOKEN=dein_token

# Server Port
PORT=3000
```

### Schritt 4: Server starten
```bash
npm start
```

Der Server läuft dann auf: `http://192.168.1.138:3000`

---

## 🌐 Zugriff von außen (optional)

### Option A: WireGuard VPN
- VPN-Verbindung zu lokalem Netzwerk
- Zugriff auf `http://192.168.1.138:3000`

### Option B: Tailscale (einfachste Lösung)
```bash
# Auf lokalem Server installieren
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# Gibt dir eine permanente URL wie:
# http://machine-name.tailnet-name.ts.net:3000
```

---

## 📦 Features

✅ **Ticket erstellen** - KI-gestützte Analyse von E-Mails/Texten
✅ **Ticket beantworten** - KI-generierte Antwortvorschläge
✅ **Kunden-Übersicht** - Ticket-Historie mit KI-Zusammenfassung
✅ **KI-Chat** - Freier Chat mit lokaler KI
✅ **Dokument-Upload** - PDF, Word, Text-Dateien analysieren
✅ **100% lokal** - Keine Cloud-Verarbeitung

---

## 🔐 Datenschutz

**Alle Daten bleiben auf deinem Server:**
- ✅ Keine Uploads zu externen Servern
- ✅ Keine Cloud-KI (nur lokale Open WebUI)
- ✅ Keine Logs auf fremden Servern
- ✅ DSGVO-konform für personenbezogene Daten

---

## 🛠️ Systemd Service (optional)

Automatischer Start beim Booten:

```bash
sudo nano /etc/systemd/system/zammad-ki-local.service
```

```ini
[Unit]
Description=Zammad KI Integration - Local
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/pfad/zu/ticket-local
ExecStart=/usr/bin/node backend/server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Aktivieren:
```bash
sudo systemctl enable zammad-ki-local
sudo systemctl start zammad-ki-local
```

---

## 📝 Unterstützte Dokumentenformate

- **PDF** (.pdf) - Text-PDFs mit selektierbarem Text
- **Word** (.doc, .docx) - Microsoft Word-Dokumente
- **Text** (.txt, .md, .csv) - Reine Textdateien

---

## 🔧 Entwicklung

```bash
# Development-Modus mit Auto-Reload
npm run dev
```

---

## 📞 Support

Bei Fragen oder Problemen: [GitHub Issues](https://github.com/jdkmzhn/ticket-local/issues)

---

## 📄 Lizenz

MIT License - siehe LICENSE Datei

