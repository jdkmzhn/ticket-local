# Verwende Node.js 18 als Basis-Image
FROM node:18-alpine

# Setze Arbeitsverzeichnis im Container
WORKDIR /app

# Kopiere package.json und package-lock.json
COPY package*.json ./

# Installiere Abhängigkeiten
RUN npm install --production

# Kopiere den gesamten Anwendungscode
COPY . .

# Exponiere Port 3000
EXPOSE 3000

# Starte die Anwendung
CMD ["npm", "start"]

