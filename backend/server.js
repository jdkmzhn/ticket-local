const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const edenAIAPI = require('./api/edenai');
const zammadAPI = require('./api/zammad');
const documentsAPI = require('./api/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer für File-Uploads konfigurieren
const upload = multer({
  storage: multer.memoryStorage(), // Dateien im RAM speichern
  limits: {
    fileSize: 10 * 1024 * 1024 // Max 10MB
  },
  fileFilter: (req, file, cb) => {
    // Erlaube nur bestimmte Dateitypen
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'text/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Dateityp nicht unterstützt. Bitte laden Sie PDF, Word oder Text-Dateien hoch.'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware um API-Credentials aus Request zu extrahieren
app.use((req, res, next) => {
  // Hole Credentials aus Custom Headers (vom Frontend gesendet)
  const clientEdenKey = req.headers['x-eden-ai-key'];
  const clientZammadUrl = req.headers['x-zammad-url'];
  const clientZammadToken = req.headers['x-zammad-token'];
  
  // Verwende Client-Credentials wenn vorhanden, sonst .env
  req.edenAiKey = clientEdenKey || process.env.EDEN_AI_API_KEY;
  req.zammadUrl = clientZammadUrl || process.env.ZAMMAD_API_URL;
  req.zammadToken = clientZammadToken || process.env.ZAMMAD_API_TOKEN;
  
  next();
});

// Health-Check Endpunkt
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Zammad KI-Integration Server läuft',
    apis: {
      edenai: !!(req.edenAiKey || process.env.EDEN_AI_API_KEY),
      zammad: !!((req.zammadUrl || process.env.ZAMMAD_API_URL) && (req.zammadToken || process.env.ZAMMAD_API_TOKEN))
    }
  });
});

// Gruppen aus Zammad laden
app.get('/api/groups', async (req, res) => {
  try {
    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log('Lade Gruppen aus Zammad...');
    const groups = await zammadAPI.getGroups(req.zammadUrl, req.zammadToken);
    
    res.json({
      success: true,
      groups: groups
    });
  } catch (error) {
    console.error('Fehler beim Laden der Gruppen:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Gruppen', 
      details: error.message 
    });
  }
});

// Kunden suchen
app.get('/api/search-customers', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Suchbegriff muss mindestens 2 Zeichen lang sein' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Suche Kunden mit Begriff: "${query}"`);
    const customers = await zammadAPI.searchCustomers(query, req.zammadUrl, req.zammadToken);
    
    res.json({
      success: true,
      customers: customers,
      count: customers.length
    });
  } catch (error) {
    console.error('Fehler bei der Kundensuche:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der Kundensuche', 
      details: error.message 
    });
  }
});

// Kunden-Tickets laden
app.post('/api/customer-tickets', async (req, res) => {
  try {
    const { email, includeSummary } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Lade Tickets für Kunde: ${email}`);
    const tickets = await zammadAPI.getCustomerTickets(email, req.zammadUrl, req.zammadToken);
    
    let detailedTickets = [];
    let summary = null;
    
    if (tickets.length > 0) {
      // Lade detaillierte Ticket-Informationen
      detailedTickets = await zammadAPI.getTicketsWithArticles(tickets, req.zammadUrl, req.zammadToken);
      
      // Erstelle KI-Zusammenfassung falls gewünscht
      if (includeSummary && req.edenAiKey) {
        const model = req.body.model || 'openai';
        const localConfig = req.body.localConfig || null;
        
        console.log(`Erstelle KI-Zusammenfassung für ${tickets.length} Tickets...`);
        const summaryResult = await edenAIAPI.generateTicketSummary(
          detailedTickets, 
          req.edenAiKey, 
          model, 
          localConfig, 
          'customer'
        );
        summary = summaryResult;
      }
    }
    
    res.json({
      success: true,
      customer: email,
      ticketCount: tickets.length,
      tickets: detailedTickets,
      summary: summary
    });
  } catch (error) {
    console.error('Fehler beim Laden der Kunden-Tickets:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Kunden-Tickets', 
      details: error.message 
    });
  }
});

// Organisations-Tickets laden
app.post('/api/organization-tickets', async (req, res) => {
  try {
    const { organizationName, includeSummary } = req.body;
    
    if (!organizationName) {
      return res.status(400).json({ error: 'Organisationsname erforderlich' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Lade Tickets für Organisation: ${organizationName}`);
    const tickets = await zammadAPI.getOrganizationTickets(organizationName, req.zammadUrl, req.zammadToken);
    
    let detailedTickets = [];
    let summary = null;
    
    if (tickets.length > 0) {
      // Lade detaillierte Ticket-Informationen
      detailedTickets = await zammadAPI.getTicketsWithArticles(tickets, req.zammadUrl, req.zammadToken);
      
      // Erstelle KI-Zusammenfassung falls gewünscht
      if (includeSummary && req.edenAiKey) {
        const model = req.body.model || 'openai';
        const localConfig = req.body.localConfig || null;
        
        console.log(`Erstelle KI-Zusammenfassung für ${tickets.length} Tickets...`);
        const summaryResult = await edenAIAPI.generateTicketSummary(
          detailedTickets, 
          req.edenAiKey, 
          model, 
          localConfig, 
          'organization'
        );
        summary = summaryResult;
      }
    }
    
    res.json({
      success: true,
      organization: organizationName,
      ticketCount: tickets.length,
      tickets: detailedTickets,
      summary: summary
    });
  } catch (error) {
    console.error('Fehler beim Laden der Organisations-Tickets:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Laden der Organisations-Tickets', 
      details: error.message 
    });
  }
});

// TEIL 1: Intelligente Ticketerstellung

// Endpunkt 1: Text durch KI analysieren
app.post('/api/analyze-text', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Kein Text zur Analyse bereitgestellt' });
    }

    if (!req.edenAiKey) {
      return res.status(400).json({ error: 'Eden AI API-Schlüssel nicht konfiguriert' });
    }

    const model = req.body.model || 'openai';
    const localConfig = req.body.localConfig || null;
    
    // Lade verfügbare Gruppen für bessere KI-Empfehlungen
    let availableGroups = [];
    try {
      if (req.zammadUrl && req.zammadToken) {
        availableGroups = await zammadAPI.getGroups(req.zammadUrl, req.zammadToken);
      }
    } catch (error) {
      console.warn('Konnte Gruppen nicht laden, verwende Fallback:', error.message);
    }
    
    console.log(`Analysiere Text mit ${model === 'local' ? 'lokaler KI' : 'Eden AI'} (Modell: ${model})...`);
    const extractedData = await edenAIAPI.extractTicketData(text, req.edenAiKey, model, localConfig, availableGroups);
    
    res.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    console.error('Fehler bei der Textanalyse:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der KI-Analyse', 
      details: error.message 
    });
  }
});

// Endpunkt 2: Kunde in Zammad prüfen
app.post('/api/check-customer', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Prüfe Kunde mit E-Mail: ${email}`);
    const customer = await zammadAPI.findCustomerByEmail(email, req.zammadUrl, req.zammadToken);
    
    if (customer) {
      res.json({
        exists: true,
        customer: customer
      });
    } else {
      res.json({
        exists: false,
        message: 'Kein bestehender Kunde gefunden. Ein neuer Kunde wird angelegt.'
      });
    }
  } catch (error) {
    console.error('Fehler bei der Kundenprüfung:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der Kundenprüfung', 
      details: error.message 
    });
  }
});

// Endpunkt 3: Organisation in Zammad prüfen
app.post('/api/check-organization', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Organisationsname erforderlich' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Prüfe Organisation: ${name}`);
    const organization = await zammadAPI.findOrganizationByName(name, req.zammadUrl, req.zammadToken);
    
    if (organization) {
      res.json({
        exists: true,
        organization: organization
      });
    } else {
      res.json({
        exists: false,
        message: 'Keine bestehende Organisation gefunden. Eine neue Organisation wird angelegt.'
      });
    }
  } catch (error) {
    console.error('Fehler bei der Organisationsprüfung:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der Organisationsprüfung', 
      details: error.message 
    });
  }
});

// Endpunkt 4: Kunde und Ticket in Zammad erstellen
app.post('/api/create-ticket', async (req, res) => {
  try {
    const { customerName, customerEmail, organization, ticketTitle, ticketBody, group, originalText, createAsEmail } = req.body;
    
    // Validierung
    if (!customerEmail || !ticketTitle) {
      return res.status(400).json({ 
        error: 'E-Mail-Adresse und Ticket-Titel sind erforderlich' 
      });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Erstelle/Aktualisiere Kunde und Ticket in Zammad (als ${createAsEmail ? 'E-Mail' : 'Notiz'})...`);
    
    // Schritt 1: Organisation erstellen/finden (falls angegeben)
    let organizationId = null;
    if (organization && organization.trim() !== '') {
      const org = await zammadAPI.findOrCreateOrganization(organization, req.zammadUrl, req.zammadToken);
      organizationId = org.id;
    }
    
    // Schritt 2: Kunde erstellen/finden
    const customer = await zammadAPI.findOrCreateCustomer({
      name: customerName,
      email: customerEmail,
      organization_id: organizationId
    }, req.zammadUrl, req.zammadToken);
    
    // Schritt 3: Ticket erstellen
    const ticket = await zammadAPI.createTicket({
      title: ticketTitle,
      group: group || 'Support',
      customer_id: customer.id,
      article: {
        subject: ticketTitle,
        body: ticketBody || originalText,
        type: createAsEmail ? 'email' : 'note', // Dynamisch basierend auf Checkbox
        internal: !createAsEmail // Nur intern wenn nicht als E-Mail
      }
    }, req.zammadUrl, req.zammadToken);
    
    res.json({
      success: true,
      message: 'Ticket erfolgreich erstellt',
      ticket: {
        id: ticket.id,
        number: ticket.number,
        title: ticket.title,
        url: `${req.zammadUrl}/#ticket/zoom/${ticket.id}`
      },
      customer: {
        id: customer.id,
        name: customer.firstname || customer.lastname ? `${customer.firstname} ${customer.lastname}` : customer.email,
        email: customer.email
      }
    });
  } catch (error) {
    console.error('Fehler bei der Ticketerstellung:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der Ticketerstellung', 
      details: error.message 
    });
  }
});

// TEIL 2: KI-gestützte Ticketbeantwortung

// Endpunkt 5: Ticketverlauf abrufen
app.get('/api/ticket/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }
    
    console.log(`Lade Ticket ${ticketId}...`);
    const ticket = await zammadAPI.getTicket(ticketId, req.zammadUrl, req.zammadToken);
    const articles = await zammadAPI.getTicketArticles(ticketId, req.zammadUrl, req.zammadToken);
    
    res.json({
      success: true,
      ticket: ticket,
      articles: articles
    });
  } catch (error) {
    console.error('Fehler beim Laden des Tickets:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Laden des Tickets', 
      details: error.message 
    });
  }
});

// Endpunkt 6: KI-Antwort generieren
app.post('/api/generate-response', async (req, res) => {
  try {
    const { ticketHistory, userInstruction } = req.body;
    
    if (!ticketHistory || !userInstruction) {
      return res.status(400).json({ 
        error: 'Ticketverlauf und Benutzeranweisung erforderlich' 
      });
    }

    if (!req.edenAiKey) {
      return res.status(400).json({ error: 'Eden AI API-Schlüssel nicht konfiguriert' });
    }

    const model = req.body.model || 'openai';
    const localConfig = req.body.localConfig || null;
    
    console.log(`Generiere KI-Antwort mit ${model === 'local' ? 'lokaler KI' : 'Eden AI'} (Modell: ${model})...`);
    const response = await edenAIAPI.generateTicketResponse(ticketHistory, userInstruction, req.edenAiKey, model, localConfig);
    
    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error('Fehler bei der Antwortgenerierung:', error.message);
    res.status(500).json({ 
      error: 'Fehler bei der Antwortgenerierung', 
      details: error.message 
    });
  }
});

// Endpunkt 7: Antwort an Ticket senden
app.post('/api/ticket/:ticketId/reply', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { body, internal } = req.body;
    
    if (!body) {
      return res.status(400).json({ error: 'Antwort-Text erforderlich' });
    }

    if (!req.zammadUrl || !req.zammadToken) {
      return res.status(400).json({ error: 'Zammad API nicht konfiguriert' });
    }

    console.log(`Sende Antwort an Ticket ${ticketId}...`);
    const article = await zammadAPI.addTicketArticle(ticketId, {
      body: body,
      type: 'note',
      internal: internal || false
    }, req.zammadUrl, req.zammadToken);
    
    res.json({
      success: true,
      message: 'Antwort erfolgreich gesendet',
      article: article
    });
  } catch (error) {
    console.error('Fehler beim Senden der Antwort:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Senden der Antwort', 
      details: error.message 
    });
  }
});

// Freier KI-Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, localConfig, chatHistory } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ 
        error: 'Nachricht ist erforderlich' 
      });
    }

    // Prüfe ob KI-Provider konfiguriert ist (Eden AI oder lokale KI)
    const hasEdenAI = !!(req.edenAiKey || process.env.EDEN_AI_API_KEY);
    const hasLocalAI = !!(localConfig && localConfig.apiKey && localConfig.apiUrl);
    
    if (!hasEdenAI && !hasLocalAI) {
      return res.status(400).json({ 
        error: 'KI-Provider nicht konfiguriert. Bitte konfigurieren Sie Eden AI oder lokale KI in den Einstellungen.' 
      });
    }

    console.log(`Freier Chat mit ${model || 'Eden AI'}...`);
    console.log(`Empfangene Chat-Historie (Backend): ${JSON.stringify(chatHistory || []).substring(0, 200)}...`);
    
    // Verwende die neue Chat-Funktion mit Historie
    const result = await edenAIAPI.generateChatResponse(
      message, 
      model || 'openai', 
      req.edenAiKey,
      localConfig,
      chatHistory || []
    );

    res.json({
      success: true,
      response: result.response,
      cost_info: result.cost_info,
      model_used: result.model_used
    });

  } catch (error) {
    console.error('Fehler beim Chat:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Chat', 
      details: error.message 
    });
  }
});

// Lokale KI Modelle laden (über Proxy)
app.post('/api/local-models', async (req, res) => {
  try {
    const { apiUrl, apiKey } = req.body;
    
    if (!apiUrl || !apiKey) {
      return res.status(400).json({ error: 'API-URL und API-Key erforderlich' });
    }
    
    // Konvertiere lokale URLs zu Tunnel
    let effectiveUrl = apiUrl;
    if (apiUrl.includes('192.168.') || apiUrl.includes('10.') || apiUrl.includes('172.')) {
      effectiveUrl = 'http://localhost:8138';
    }
    
    const axios = require('axios');
    const response = await axios.get(`${effectiveUrl}/api/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Fehler beim Laden der Modelle:', error.message);
    res.status(500).json({ error: 'Fehler beim Laden der Modelle', details: error.message });
  }
});

// Dokument hochladen und Text extrahieren
app.post('/api/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Keine Datei hochgeladen' 
      });
    }

    console.log(`📄 Verarbeite Dokument: ${req.file.originalname} (${req.file.size} Bytes)`);
    
    // Text aus Dokument extrahieren
    const result = await documentsAPI.extractDocumentText(req.file);
    
    // Textlänge prüfen
    const textLength = result.text.length;
    const wordCount = result.text.split(/\s+/).length;
    
    console.log(`✅ Text extrahiert: ${wordCount} Wörter, ${textLength} Zeichen`);
    
    res.json({
      success: true,
      filename: result.filename,
      type: result.type,
      text: result.text,
      stats: {
        characters: textLength,
        words: wordCount,
        pages: result.pages || null
      },
      metadata: result.metadata || null
    });
    
  } catch (error) {
    console.error('Fehler beim Dokument-Upload:', error.message);
    res.status(500).json({ 
      error: 'Fehler beim Verarbeiten des Dokuments', 
      details: error.message 
    });
  }
});

// Alle anderen Routen liefern die Frontend-HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Server starten
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Zammad KI-Integration Server läuft auf Port ${PORT}`);
  console.log(`📱 Öffne http://localhost:${PORT} im Browser\n`);
  
  // API-Schlüssel Validierung
  if (!process.env.EDEN_AI_API_KEY) {
    console.warn('⚠️  WARNUNG: EDEN_AI_API_KEY nicht in .env gesetzt (kann über Frontend konfiguriert werden)');
  }
  if (!process.env.ZAMMAD_API_URL || !process.env.ZAMMAD_API_TOKEN) {
    console.warn('⚠️  WARNUNG: Zammad API nicht in .env konfiguriert (kann über Frontend konfiguriert werden)');
  }
});
