const axios = require('axios');

const EDEN_AI_BASE_URL = 'https://api.edenai.run/v2';

/**
 * Ruft lokale KI über Open WebUI API auf
 * @param {string} prompt - Der Prompt für die KI
 * @param {string} model - Das zu verwendende Modell
 * @param {string} apiUrl - Open WebUI API URL
 * @param {string} apiKey - API-Schlüssel
 * @returns {Promise<Object>} KI-Antwort mit Kosten-Info
 */
async function callLocalAI(prompt, model, apiUrl, apiKey) {
  try {
    // Konvertiere lokale/private URLs zu localhost (für SSH-Tunnel)
    let effectiveUrl = apiUrl;
    if (apiUrl.includes('192.168.') || apiUrl.includes('10.') || apiUrl.includes('172.')) {
      effectiveUrl = 'http://localhost:8138';
      console.log(`Lokale IP erkannt, verwende Tunnel: ${effectiveUrl}`);
    }
    
    // Prüfe verfügbare Modelle zuerst
    let availableModels = [];
    try {
      const modelsResponse = await axios.get(`${effectiveUrl}/api/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      availableModels = modelsResponse.data.data || [];
      console.log('Verfügbare lokale Modelle:', availableModels.map(m => m.id).join(', '));
    } catch (error) {
      console.warn('Konnte verfügbare Modelle nicht laden:', error.message);
    }
    
    // Verwende das erste verfügbare Modell falls das gewünschte nicht existiert
    let modelToUse = model;
    if (availableModels.length > 0) {
      const modelExists = availableModels.some(m => m.id === model);
      if (!modelExists) {
        modelToUse = availableModels[0].id;
        console.log(`Modell ${model} nicht gefunden, verwende ${modelToUse}`);
      }
    }
    
    const response = await axios.post(
      `${effectiveUrl}/api/chat/completions`,
      {
        model: modelToUse,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const generatedText = response.data.choices[0].message.content;
    
    return {
      response: generatedText,
      cost_info: {
        input_tokens: response.data.usage?.prompt_tokens || 0,
        output_tokens: response.data.usage?.completion_tokens || 0,
        total_tokens: response.data.usage?.total_tokens || 0,
        cost: 0, // Lokale KI ist kostenlos
        currency: 'EUR'
      },
      model_used: `local-${modelToUse}`
    };

  } catch (error) {
    console.error('Lokale KI API Fehler:', error.response?.data || error.message);
    throw new Error(`Fehler bei der lokalen KI: ${error.message}`);
  }
}

/**
 * Extrahiert strukturierte Ticketdaten aus unstrukturiertem Text
 * @param {string} text - Der zu analysierende Text
 * @param {string} apiKey - Eden AI API-Schlüssel
 * @param {string} model - KI-Modell (openai, mistral, mistral-small, claude, local)
 * @param {Object} localConfig - Konfiguration für lokale KI
 * @param {Array} availableGroups - Verfügbare Gruppen aus Zammad
 * @returns {Promise<Object>} Extrahierte Daten mit Kosten-Info
 */
async function extractTicketData(text, apiKey, model = 'openai', localConfig = null, availableGroups = []) {
  try {
    // Erstelle Gruppen-Liste für den Prompt
    const groupNames = availableGroups.length > 0 
      ? availableGroups.map(g => g.name).join('", "')
      : 'Support", "Beratung", "Technik", "Vertrieb';
    
    // Prüfe ob lokale KI verwendet werden soll
    if (model === 'local' && localConfig) {
      const prompt = `Du bist ein Assistent, der Kundenanfragen analysiert. 
Extrahiere folgende Informationen aus dem Text und gib sie im JSON-Format zurück:
- customer_name: Vollständiger Name des Kunden
- customer_email: E-Mail-Adresse des Kunden
- organization: Name der Organisation/Firma (falls vorhanden)
- ticket_title: Ein prägnanter Titel für das Ticket (max 80 Zeichen)
- ticket_body: Der Hauptinhalt der Anfrage
- suggested_group: Empfohlene Gruppe/Team (WÄHLE NUR AUS: "${groupNames}")

Text: ${text}

Antworte NUR mit einem gültigen JSON-Objekt ohne zusätzlichen Text.`;

      const result = await callLocalAI(prompt, localConfig.model, localConfig.url, localConfig.apiKey);
      
      // Parse JSON aus der Antwort
      let extractedData;
      try {
        const aiResponse = result.response.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        extractedData = JSON.parse(aiResponse);
      } catch (parseError) {
        console.warn('JSON-Parsing fehlgeschlagen, verwende Fallback-Extraktion');
        extractedData = extractWithRegex(text);
      }

      return {
        customer_name: extractedData.customer_name || '',
        customer_email: extractedData.customer_email || '',
        organization: extractedData.organization || '',
        ticket_title: extractedData.ticket_title || 'Neue Kundenanfrage',
        ticket_body: extractedData.ticket_body || text,
        suggested_group: extractedData.suggested_group || 'Support',
        cost_info: result.cost_info,
        model_used: result.model_used
      };
    }

    // Modell-Mapping für Eden AI
    const modelMapping = {
      'openai': 'openai',
      'mistral': 'mistral',
      'mistral-small': 'mistral',
      'claude': 'anthropic'
    };

    const provider = modelMapping[model] || 'openai';
    
    // Verwende Eden AI's Text-Analyse mit gewähltem Modell
    const response = await axios.post(
      `${EDEN_AI_BASE_URL}/text/chat`,
      {
        providers: provider,
        text: text,
        chatbot_global_action: `Du bist ein Assistent, der Kundenanfragen analysiert. 
Extrahiere folgende Informationen aus dem Text und gib sie im JSON-Format zurück:
- customer_name: Vollständiger Name des Kunden
- customer_email: E-Mail-Adresse des Kunden
- organization: Name der Organisation/Firma (falls vorhanden)
- ticket_title: Ein prägnanter Titel für das Ticket (max 80 Zeichen)
- ticket_body: Der Hauptinhalt der Anfrage
- suggested_group: Empfohlene Gruppe/Team (WÄHLE NUR AUS: "${groupNames}")

Antworte NUR mit einem gültigen JSON-Objekt ohne zusätzlichen Text.`,
        previous_history: [],
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extrahiere die KI-Antwort und Kosten-Info
    let aiResponse = response.data?.[provider]?.generated_text || '';
    const costInfo = response.data?.[provider]?.cost || null;
    
    // Versuche JSON aus der Antwort zu extrahieren
    let extractedData;
    try {
      // Entferne möglicherweise umgebende Markdown-Blöcke
      aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      extractedData = JSON.parse(aiResponse);
    } catch (parseError) {
      // Fallback: Versuche mit Regex zu extrahieren
      console.warn('JSON-Parsing fehlgeschlagen, verwende Fallback-Extraktion');
      extractedData = extractWithRegex(text);
    }

    // Validierung und Fallback-Werte
    return {
      customer_name: extractedData.customer_name || '',
      customer_email: extractedData.customer_email || '',
      organization: extractedData.organization || '',
      ticket_title: extractedData.ticket_title || 'Neue Kundenanfrage',
      ticket_body: extractedData.ticket_body || text,
      suggested_group: extractedData.suggested_group || 'Support',
      cost_info: costInfo,
      model_used: model
    };

  } catch (error) {
    console.error('Eden AI API Fehler:', error.response?.data || error.message);
    
    // Fallback: Regex-basierte Extraktion
    return extractWithRegex(text);
  }
}

/**
 * Fallback-Funktion: Extrahiert Daten mit Regex
 */
function extractWithRegex(text) {
  // E-Mail extrahieren
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const emailMatch = text.match(emailRegex);
  const email = emailMatch ? emailMatch[0] : '';

  // Name extrahieren (Zeile vor oder nach E-Mail)
  let name = '';
  if (email) {
    const lines = text.split('\n');
    const emailLineIndex = lines.findIndex(line => line.includes(email));
    if (emailLineIndex > 0) {
      name = lines[emailLineIndex - 1].trim();
    }
  }

  // Ersten Satz als Titel verwenden
  const firstSentence = text.split(/[.!?]/)[0].trim();
  const title = firstSentence.length > 80 
    ? firstSentence.substring(0, 77) + '...' 
    : firstSentence;

  return {
    customer_name: name,
    customer_email: email,
    organization: '',
    ticket_title: title || 'Neue Kundenanfrage',
    ticket_body: text,
    suggested_group: 'Support'
  };
}

/**
 * Generiert eine KI-Antwort basierend auf dem Ticketverlauf
 * @param {Array} ticketHistory - Array mit allen bisherigen Nachrichten
 * @param {string} userInstruction - Anweisung des Benutzers für die Antwort
 * @param {string} apiKey - Eden AI API-Schlüssel
 * @param {string} model - KI-Modell (openai, mistral, mistral-small, claude, local)
 * @param {Object} localConfig - Konfiguration für lokale KI
 * @returns {Promise<Object>} Generierte Antwort mit Kosten-Info
 */
async function generateTicketResponse(ticketHistory, userInstruction, apiKey, model = 'openai', localConfig = null) {
  try {
    // Formatiere den Ticketverlauf für den Kontext
    const historyText = ticketHistory.map((article, index) => {
      return `[${index + 1}] ${article.from || 'System'} (${article.created_at}):\n${article.body}\n`;
    }).join('\n---\n');

    const prompt = `Du bist ein professioneller Kundensupport-Mitarbeiter. 

Hier ist der bisherige Ticketverlauf:
${historyText}

Aufgabe: ${userInstruction}

Schreibe eine professionelle, hilfsbereite Antwort auf Deutsch. Die Antwort sollte:
- Höflich und kundenorientiert sein
- Sich auf die konkrete Anfrage beziehen
- Klar und verständlich formuliert sein
- Eine passende Anrede und Grußformel enthalten

Antworte NUR mit der E-Mail, ohne zusätzliche Erklärungen oder Kommentare.`;

    // Prüfe ob lokale KI verwendet werden soll
    if (model === 'local' && localConfig) {
      const result = await callLocalAI(prompt, localConfig.model, localConfig.url, localConfig.apiKey);
      return {
        response: result.response,
        cost_info: result.cost_info,
        model_used: result.model_used
      };
    }

    // Modell-Mapping für Eden AI
    const modelMapping = {
      'openai': 'openai',
      'mistral': 'mistral',
      'mistral-small': 'mistral',
      'claude': 'anthropic'
    };

    const provider = modelMapping[model] || 'openai';

    const response = await axios.post(
      `${EDEN_AI_BASE_URL}/text/chat`,
      {
        providers: provider,
        text: prompt,
        chatbot_global_action: 'Du bist ein Kundensupport-Mitarbeiter, der E-Mail-Antworten verfasst.',
        previous_history: [],
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const generatedText = response.data?.[provider]?.generated_text || '';
    const costInfo = response.data?.[provider]?.cost || null;
    
    if (!generatedText) {
      throw new Error('Keine Antwort von Eden AI erhalten');
    }

    return {
      response: generatedText.trim(),
      cost_info: costInfo,
      model_used: model
    };

  } catch (error) {
    console.error('Eden AI API Fehler:', error.response?.data || error.message);
    throw new Error(`Fehler bei der KI-Antwortgenerierung: ${error.message}`);
  }
}

/**
 * Erstellt eine KI-Zusammenfassung von Ticket-Historien
 * @param {Array} tickets - Array mit Ticket-Daten
 * @param {string} apiKey - Eden AI API-Schlüssel
 * @param {string} model - KI-Modell (openai, mistral, mistral-small, claude, local)
 * @param {Object} localConfig - Konfiguration für lokale KI
 * @param {string} type - Typ der Zusammenfassung ('customer' oder 'organization')
 * @returns {Promise<Object>} Zusammenfassung mit Kosten-Info
 */
async function generateTicketSummary(tickets, apiKey, model = 'openai', localConfig = null, type = 'customer') {
  try {
    if (!tickets || tickets.length === 0) {
      return {
        summary: 'Keine Tickets gefunden.',
        cost_info: null,
        model_used: model
      };
    }

    // Erstelle strukturierte Ticket-Daten für den Prompt
    const ticketData = tickets.map(ticket => {
      const articles = ticket.articles || [];
      const firstArticle = articles[0];
      const lastArticle = articles[articles.length - 1];
      
      return {
        id: ticket.number || ticket.id,
        title: ticket.title,
        created_at: ticket.created_at,
        state: ticket.state?.name || 'Unbekannt',
        priority: ticket.priority?.name || 'Normal',
        group: ticket.group?.name || 'Unbekannt',
        first_message: firstArticle?.body || 'Keine Nachricht',
        last_message: lastArticle?.body || 'Keine Nachricht',
        message_count: articles.length
      };
    });

    const prompt = `Du bist ein Kundenservice-Analyst. Erstelle eine prägnante Zusammenfassung der Ticket-Historie.

${type === 'customer' ? 'KUNDEN-ÜBERSICHT:' : 'ORGANISATIONS-ÜBERSICHT:'}

Tickets (${tickets.length} gefunden):
${ticketData.map(t => `
Ticket #${t.id} (${t.created_at}):
- Titel: ${t.title}
- Status: ${t.state} | Priorität: ${t.priority} | Gruppe: ${t.group}
- Nachrichten: ${t.message_count}
- Erste Nachricht: ${t.first_message.substring(0, 200)}...
- Letzte Nachricht: ${t.last_message.substring(0, 200)}...
`).join('\n')}

Erstelle eine strukturierte Zusammenfassung mit:
1. **Überblick**: Anzahl Tickets, Zeitraum, Hauptthemen
2. **Status-Verteilung**: Aufschlüsselung nach Ticket-Status
3. **Hauptprobleme**: Die häufigsten Anliegen/Themen
4. **Trends**: Entwicklung über die Zeit
5. **Empfehlungen**: Handlungsempfehlungen für den Kundenservice

Antworte auf Deutsch in einem professionellen, aber verständlichen Stil.`;

    if (model === 'local' && localConfig) {
      const result = await callLocalAI(prompt, localConfig.model, localConfig.url, localConfig.apiKey);
      return {
        summary: result.response,
        cost_info: result.cost_info,
        model_used: result.model_used
      };
    }

    const modelMapping = {
      'openai': 'openai',
      'mistral': 'mistral',
      'mistral-small': 'mistral',
      'claude': 'anthropic'
    };

    const provider = modelMapping[model] || 'openai';

    const response = await axios.post(
      `${EDEN_AI_BASE_URL}/text/chat`,
      {
        providers: provider,
        text: prompt,
        chatbot_global_action: 'Du bist ein Kundenservice-Analyst, der prägnante und hilfreiche Zusammenfassungen erstellt.',
        previous_history: [],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const generatedText = response.data?.[provider]?.generated_text || '';
    const costInfo = response.data?.[provider]?.cost || null;
    
    if (!generatedText) {
      throw new Error('Keine Zusammenfassung von Eden AI erhalten');
    }

    return {
      summary: generatedText.trim(),
      cost_info: costInfo,
      model_used: model
    };

  } catch (error) {
    console.error('Eden AI API Fehler bei Zusammenfassung:', error.response?.data || error.message);
    throw new Error(`Fehler bei der KI-Zusammenfassung: ${error.message}`);
  }
}

/**
 * Generiert eine freie KI-Antwort für den Chatbot
 * @param {string} message - Die Benutzer-Nachricht
 * @param {string} model - Das zu verwendende Modell
 * @param {string} apiKey - API-Schlüssel
 * @param {Object} localConfig - Lokale KI-Konfiguration
 * @param {Array} chatHistory - Chat-Historie für Kontext
 * @returns {Promise<Object>} KI-Antwort mit Kosten-Info
 */
async function generateChatResponse(message, model, apiKey, localConfig, chatHistory = []) {
  try {
    console.log(`Generiere Chat-Antwort mit ${model} (${chatHistory.length} vorherige Nachrichten)...`);
    
    if (model === 'local' && localConfig) {
      // Für lokale KI: Baue vollständigen Prompt mit Historie
      let fullPrompt = '';
      
      // Füge Chat-Historie hinzu
      if (chatHistory.length > 0) {
        fullPrompt += "Bisherige Konversation:\n";
        chatHistory.forEach(msg => {
          const role = msg.role === 'user' ? 'Benutzer' : 'Assistent';
          fullPrompt += `${role}: ${msg.content}\n`;
        });
        fullPrompt += '\n';
      }
      
      // Aktuelle Nachricht
      fullPrompt += `Benutzer: ${message}\nAssistent:`;
      
      return await callLocalAI(fullPrompt, localConfig.model, localConfig.apiUrl, localConfig.apiKey);
    } else {
      // Eden AI für Chat mit Historie
      const response = await axios.post(
        `${EDEN_AI_BASE_URL}/text/chat`,
        {
          providers: model,
          text: message,
          chatbot_global_action: "Du bist ein hilfreicher KI-Assistent. Antworte auf Deutsch und sei freundlich und hilfreich.",
          previous_history: chatHistory.map(msg => ({
            role: msg.role,
            message: msg.content
          })),
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data[model];
      
      if (!result || !result.generated_text) {
        throw new Error('Keine Antwort von der KI erhalten');
      }

      return {
        response: result.generated_text,
        cost_info: {
          input_tokens: result.usage?.prompt_tokens || 0,
          output_tokens: result.usage?.completion_tokens || 0,
          total_tokens: result.usage?.total_tokens || 0,
          cost: result.cost || 0,
          currency: 'EUR'
        },
        model_used: model
      };
    }
  } catch (error) {
    console.error('Fehler bei der Chat-Antwortgenerierung:', error.message);
    throw new Error(`Fehler bei der Chat-Antwortgenerierung: ${error.message}`);
  }
}

module.exports = {
  extractTicketData,
  generateTicketResponse,
  generateTicketSummary,
  generateChatResponse
};

