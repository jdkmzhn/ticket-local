// API Base URL
const API_BASE = '/api';

// Globale Variable für den ursprünglichen Text
let originalRequestText = '';
let currentTicketHistory = [];
let currentTicketId = null;
let zammadGroups = []; // Globale Variable für Zammad-Gruppen
let selectedCustomer = null; // Ausgewählter Kunde
let searchTimeout = null; // Timeout für Autocomplete

// ========================================
// LOCALSTORAGE API-SCHLÜSSEL VERWALTUNG
// ========================================

const STORAGE_KEYS = {
    AI_PROVIDER: 'zammad_ki_ai_provider',
    EDEN_AI_KEY: 'zammad_ki_edenai_key',
    EDENAI_MODEL: 'zammad_ki_edenai_model',
    LOCAL_AI_URL: 'zammad_ki_local_ai_url',
    LOCAL_AI_KEY: 'zammad_ki_local_ai_key',
    LOCAL_AI_MODEL: 'zammad_ki_local_ai_model',
    ZAMMAD_URL: 'zammad_ki_zammad_url',
    ZAMMAD_TOKEN: 'zammad_ki_zammad_token'
};

// API-Schlüssel aus LocalStorage laden
function getApiCredentials() {
    return {
        aiProvider: localStorage.getItem(STORAGE_KEYS.AI_PROVIDER) || 'edenai',
        edenAiKey: localStorage.getItem(STORAGE_KEYS.EDEN_AI_KEY) || '',
        edenaiModel: localStorage.getItem(STORAGE_KEYS.EDENAI_MODEL) || 'openai',
        localAiUrl: localStorage.getItem(STORAGE_KEYS.LOCAL_AI_URL) || 'http://192.168.1.138:3000',
        localAiKey: localStorage.getItem(STORAGE_KEYS.LOCAL_AI_KEY) || '',
        localAiModel: localStorage.getItem(STORAGE_KEYS.LOCAL_AI_MODEL) || 'llama3',
        zammadUrl: localStorage.getItem(STORAGE_KEYS.ZAMMAD_URL) || '',
        zammadToken: localStorage.getItem(STORAGE_KEYS.ZAMMAD_TOKEN) || ''
    };
}

// API-Schlüssel in LocalStorage speichern
function saveApiCredentials(aiProvider, edenAiKey, edenaiModel, localAiUrl, localAiKey, localAiModel, zammadUrl, zammadToken) {
    localStorage.setItem(STORAGE_KEYS.AI_PROVIDER, aiProvider);
    localStorage.setItem(STORAGE_KEYS.EDEN_AI_KEY, edenAiKey);
    localStorage.setItem(STORAGE_KEYS.EDENAI_MODEL, edenaiModel);
    localStorage.setItem(STORAGE_KEYS.LOCAL_AI_URL, localAiUrl);
    localStorage.setItem(STORAGE_KEYS.LOCAL_AI_KEY, localAiKey);
    localStorage.setItem(STORAGE_KEYS.LOCAL_AI_MODEL, localAiModel);
    localStorage.setItem(STORAGE_KEYS.ZAMMAD_URL, zammadUrl);
    localStorage.setItem(STORAGE_KEYS.ZAMMAD_TOKEN, zammadToken);
}

// Alle Einstellungen löschen
function clearApiCredentials() {
    localStorage.removeItem(STORAGE_KEYS.AI_PROVIDER);
    localStorage.removeItem(STORAGE_KEYS.EDEN_AI_KEY);
    localStorage.removeItem(STORAGE_KEYS.EDENAI_MODEL);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_AI_URL);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_AI_KEY);
    localStorage.removeItem(STORAGE_KEYS.LOCAL_AI_MODEL);
    localStorage.removeItem(STORAGE_KEYS.ZAMMAD_URL);
    localStorage.removeItem(STORAGE_KEYS.ZAMMAD_TOKEN);
}

// Prüfe ob API-Schlüssel konfiguriert sind
function areCredentialsConfigured() {
    const creds = getApiCredentials();
    return creds.edenAiKey && creds.zammadUrl && creds.zammadToken;
}

// Erstelle Headers mit API-Credentials
function getApiHeaders() {
    const creds = getApiCredentials();
    return {
        'Content-Type': 'application/json',
        'X-Eden-AI-Key': creds.edenAiKey,
        'X-Zammad-URL': creds.zammadUrl,
        'X-Zammad-Token': creds.zammadToken
    };
}

// ========================================
// ZAMMAD GRUPPEN VERWALTUNG
// ========================================

// Lade Gruppen aus Zammad
async function loadZammadGroups() {
    try {
        const response = await fetch(`${API_BASE}/groups`, {
            method: 'GET',
            headers: getApiHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success && result.groups) {
            zammadGroups = result.groups;
            console.log('Gruppen aus Zammad geladen:', zammadGroups.map(g => g.name).join(', '));
            updateGroupDropdown();
            return zammadGroups;
        } else {
            throw new Error('Keine Gruppen in der Antwort gefunden');
        }
    } catch (error) {
        console.error('Fehler beim Laden der Gruppen:', error.message);
        // Fallback auf Standard-Gruppen
        zammadGroups = [
            { id: 1, name: 'Support' },
            { id: 2, name: 'Beratung' },
            { id: 3, name: 'Technik' },
            { id: 4, name: 'Vertrieb' }
        ];
        console.log('Verwende Fallback-Gruppen:', zammadGroups.map(g => g.name).join(', '));
        updateGroupDropdown();
        return zammadGroups;
    }
}

// Aktualisiere das Gruppen-Dropdown mit geladenen Gruppen
function updateGroupDropdown() {
    const groupSelect = document.getElementById('group');
    if (!groupSelect) return;
    
    // Speichere aktuell gewählten Wert
    const currentValue = groupSelect.value;
    
    // Lösche alle Optionen
    groupSelect.innerHTML = '';
    
    // Füge neue Optionen hinzu
    zammadGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.name;
        option.textContent = group.name;
        groupSelect.appendChild(option);
    });
    
    // Setze vorherigen Wert wieder, falls er noch existiert
    if (currentValue && zammadGroups.some(g => g.name === currentValue)) {
        groupSelect.value = currentValue;
    }
    
    console.log('Gruppen-Dropdown aktualisiert mit:', zammadGroups.map(g => g.name).join(', '));
}

// ========================================
// KI-STATUS ANZEIGE
// ========================================

// Aktualisiere die KI-Status-Anzeige im Header
function updateAIStatus() {
    const statusValue = document.getElementById('ai-status-value');
    if (!statusValue) return;
    
    const creds = getApiCredentials();
    
    if (!creds.aiProvider) {
        statusValue.textContent = 'Nicht konfiguriert';
        statusValue.style.color = '#ffeb3b';
        return;
    }
    
    let statusText = '';
    
    if (creds.aiProvider === 'edenai') {
        // Eden AI Provider
        const modelNames = {
            'openai': 'OpenAI GPT',
            'mistral': 'Mistral AI',
            'mistral-small': 'Mistral Small',
            'claude': 'Claude (Anthropic)'
        };
        const modelName = modelNames[creds.edenaiModel] || creds.edenaiModel || 'OpenAI GPT';
        statusText = `Eden AI - ${modelName}`;
    } else if (creds.aiProvider === 'local') {
        // Lokale KI
        const modelName = creds.localAiModel || 'Unbekannt';
        statusText = `Lokal - ${modelName}`;
    }
    
    statusValue.textContent = statusText;
    statusValue.style.color = '#fff';
}

// ========================================
// TAB NAVIGATION
// ========================================

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// ========================================
// TEIL 1: TICKETERSTELLUNG
// ========================================

// Schritt 1: Text analysieren
document.getElementById('analyze-btn').addEventListener('click', async () => {
    const text = document.getElementById('request-text').value.trim();
    
    if (!text) {
        showError('Bitte geben Sie einen Text ein.');
        return;
    }
    
    originalRequestText = text;
    
    // Zeige Loading
    document.getElementById('analysis-loading').style.display = 'block';
    document.getElementById('analyze-btn').disabled = true;
    
    try {
        const creds = getApiCredentials();
        const requestBody = { 
            text,
            model: creds.aiProvider === 'local' ? 'local' : creds.edenaiModel
        };
        
        // Füge lokale KI-Konfiguration hinzu falls gewählt
        if (creds.aiProvider === 'local') {
            requestBody.localConfig = {
                url: creds.localAiUrl,
                apiKey: creds.localAiKey,
                model: creds.localAiModel
            };
        }
        
        const response = await fetch(`${API_BASE}/analyze-text`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Fehler bei der Analyse');
        }
        
        // Fülle Formular mit extrahierten Daten
        const data = result.data;
        document.getElementById('customer-name').value = data.customer_name || '';
        document.getElementById('customer-email').value = data.customer_email || '';
        document.getElementById('organization').value = data.organization || '';
        document.getElementById('ticket-title').value = data.ticket_title || '';
        
        // Kombiniere Original-Text mit KI-Zusammenfassung
        let ticketBodyContent = '';
        if (originalRequestText && data.ticket_body) {
            // Beide vorhanden: Original + Zusammenfassung
            ticketBodyContent = `${originalRequestText}\n\n--- KI-Zusammenfassung ---\n\n${data.ticket_body}`;
        } else {
            // Nur eines vorhanden
            ticketBodyContent = data.ticket_body || originalRequestText;
        }
        document.getElementById('ticket-body').value = ticketBodyContent;
        
        document.getElementById('group').value = data.suggested_group || 'Support';
        
        // Zeige Kosten-Info falls verfügbar
        if (data.cost_info) {
            displayCostInfo(data.cost_info, data.model_used);
        }
        
        // Log verwendetes Modell in der Konsole
        console.log(`✅ KI-Analyse abgeschlossen mit Modell: ${data.model_used || 'Unbekannt'}`);
        
        // Prüfe Kunde und Organisation
        await checkCustomerAndOrganization(data.customer_email, data.organization);
        
        // Zeige Verifizierungsbereich
        document.getElementById('text-input-section').style.display = 'none';
        document.getElementById('verification-section').style.display = 'block';
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('analysis-loading').style.display = 'none';
        document.getElementById('analyze-btn').disabled = false;
    }
});

// Zeige Kosten-Informationen an
function displayCostInfo(costInfo, modelUsed) {
    const costDisplay = document.getElementById('cost-display');
    if (!costDisplay) return;
    
    if (costInfo && costInfo.cost !== undefined) {
        const costDetails = `
            <div class="cost-item">
                <span class="cost-label">Modell:</span>
                <span class="cost-value">${modelUsed || 'Unbekannt'}</span>
            </div>
            <div class="cost-item">
                <span class="cost-label">Kosten:</span>
                <span class="cost-value">${costInfo.cost.toFixed(6)} ${costInfo.currency || 'USD'}</span>
            </div>
            <div class="cost-item">
                <span class="cost-label">Tokens (Input/Output):</span>
                <span class="cost-value">${costInfo.input_tokens || 0} / ${costInfo.output_tokens || 0}</span>
            </div>
        `;
        costDisplay.innerHTML = `<div class="cost-details">${costDetails}</div>`;
        costDisplay.style.display = 'block';
    } else {
        costDisplay.style.display = 'none';
    }
}

// Prüfe Kunde und Organisation in Zammad
async function checkCustomerAndOrganization(email, organizationName) {
    const customerStatus = document.getElementById('customer-status');
    const organizationStatus = document.getElementById('organization-status');
    
    // Prüfe Kunde
    if (email) {
        try {
            const response = await fetch(`${API_BASE}/check-customer`, {
                method: 'POST',
                headers: getApiHeaders(),
                body: JSON.stringify({ email })
            });
            
            const result = await response.json();
            
            if (result.exists) {
                customerStatus.className = 'status-box success';
                customerStatus.innerHTML = `<span>✅</span><div><strong>Bestehender Kunde gefunden:</strong><br>${result.customer.firstname} ${result.customer.lastname} (${result.customer.email})</div>`;
            } else {
                customerStatus.className = 'status-box info';
                customerStatus.innerHTML = `<span>ℹ️</span><div>${result.message}</div>`;
            }
            customerStatus.style.display = 'flex';
        } catch (error) {
            console.error('Fehler bei Kundenprüfung:', error);
        }
    }
    
    // Prüfe Organisation
    if (organizationName) {
        try {
            const response = await fetch(`${API_BASE}/check-organization`, {
                method: 'POST',
                headers: getApiHeaders(),
                body: JSON.stringify({ name: organizationName })
            });
            
            const result = await response.json();
            
            if (result.exists) {
                organizationStatus.className = 'status-box success';
                organizationStatus.innerHTML = `<span>✅</span><div><strong>Bestehende Organisation gefunden:</strong><br>${result.organization.name}</div>`;
            } else {
                organizationStatus.className = 'status-box info';
                organizationStatus.innerHTML = `<span>ℹ️</span><div>${result.message}</div>`;
            }
            organizationStatus.style.display = 'flex';
        } catch (error) {
            console.error('Fehler bei Organisationsprüfung:', error);
        }
    }
}

// Zurück-Button
document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('verification-section').style.display = 'none';
    document.getElementById('text-input-section').style.display = 'block';
});

// Schritt 2: Ticket erstellen
document.getElementById('create-ticket-btn').addEventListener('click', async () => {
    const customerName = document.getElementById('customer-name').value.trim();
    const customerEmail = document.getElementById('customer-email').value.trim();
    const organization = document.getElementById('organization').value.trim();
    const ticketTitle = document.getElementById('ticket-title').value.trim();
    const ticketBody = document.getElementById('ticket-body').value.trim();
    const group = document.getElementById('group').value;
    const createAsEmail = document.getElementById('create-as-email').checked;
    
    // Validierung
    if (!customerEmail || !ticketTitle) {
        showError('Bitte füllen Sie alle Pflichtfelder aus.');
        return;
    }
    
    // Zeige Loading
    document.getElementById('create-loading').style.display = 'block';
    document.getElementById('create-ticket-btn').disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/create-ticket`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                customerName,
                customerEmail,
                organization,
                ticketTitle,
                ticketBody,
                group,
                originalText: originalRequestText,
                createAsEmail: createAsEmail
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Fehler bei der Ticketerstellung');
        }
        
        // Zeige Erfolgsmeldung
        document.getElementById('verification-section').style.display = 'none';
        document.getElementById('success-section').style.display = 'block';
        
        document.getElementById('success-details').innerHTML = `
            <p><strong>Ticket-Nummer:</strong> ${result.ticket.number}</p>
            <p><strong>Titel:</strong> ${result.ticket.title}</p>
            <p><strong>Kunde:</strong> ${result.customer.name} (${result.customer.email})</p>
            <p><strong>Link:</strong> <a href="${result.ticket.url}" target="_blank">Ticket in Zammad öffnen →</a></p>
        `;
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('create-loading').style.display = 'none';
        document.getElementById('create-ticket-btn').disabled = false;
    }
});

// Neues Ticket Button
document.getElementById('new-ticket-btn').addEventListener('click', () => {
    // Reset Form
    document.getElementById('request-text').value = '';
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-email').value = '';
    document.getElementById('organization').value = '';
    document.getElementById('ticket-title').value = '';
    document.getElementById('ticket-body').value = '';
    document.getElementById('customer-status').style.display = 'none';
    document.getElementById('organization-status').style.display = 'none';
    
    // Zeige Eingabebereich
    document.getElementById('success-section').style.display = 'none';
    document.getElementById('text-input-section').style.display = 'block';
});

// ========================================
// TEIL 2: TICKETBEANTWORTUNG
// ========================================

// Ticket laden
document.getElementById('load-ticket-btn').addEventListener('click', async () => {
    const ticketId = document.getElementById('ticket-id').value.trim();
    
    if (!ticketId) {
        showError('Bitte geben Sie eine Ticket-ID ein.');
        return;
    }
    
    // Zeige Loading
    document.getElementById('load-loading').style.display = 'block';
    document.getElementById('load-ticket-btn').disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/ticket/${ticketId}`, {
            headers: getApiHeaders()
        });
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Fehler beim Laden des Tickets');
        }
        
        currentTicketId = ticketId;
        currentTicketHistory = result.articles;
        
        // Bestimme Status-Name und CSS-Klasse
        // Fallback-Mapping für Status-IDs (typische Zammad-Werte)
        const statusMapping = {
            1: 'Neu',
            2: 'Offen',
            3: 'Warten auf Erinnerung',
            4: 'Geschlossen',
            5: 'Zusammengeführt',
            6: 'Warten auf Schließen',
            7: 'Warten auf Kunde'
        };
        
        let statusName = result.ticket.state?.name || statusMapping[result.ticket.state_id] || `Status ${result.ticket.state_id}`;
        const statusClass = getStatusClass(statusName);
        
        // Zeige Ticket-Info
        document.getElementById('ticket-info').innerHTML = `
            <h3>Ticket #${result.ticket.number}</h3>
            <p><strong>Titel:</strong> ${result.ticket.title}</p>
            <p><strong>Status:</strong> <span class="ticket-status ${statusClass}">${statusName}</span></p>
            <p><strong>Erstellt:</strong> ${new Date(result.ticket.created_at).toLocaleString('de-DE')}</p>
        `;
        
        // Zeige Ticketverlauf
        const historyHTML = result.articles.map(article => `
            <div class="ticket-article ${article.internal ? 'internal' : ''}">
                <div class="article-header">
                    <span class="article-from">${article.from || 'System'}</span>
                    <span>${new Date(article.created_at).toLocaleString('de-DE')}</span>
                </div>
                <div class="article-body">${article.body}</div>
                ${article.internal ? '<div style="color: #92400e; font-size: 0.9rem; margin-top: 10px;">🔒 Interne Notiz</div>' : ''}
            </div>
        `).join('');
        
        document.getElementById('ticket-history').innerHTML = historyHTML;
        
        // Zeige Bereiche
        document.getElementById('ticket-history-section').style.display = 'block';
        document.getElementById('response-section').style.display = 'block';
        document.getElementById('response-success').style.display = 'none';
        document.getElementById('generated-response-section').style.display = 'none';
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('load-loading').style.display = 'none';
        document.getElementById('load-ticket-btn').disabled = false;
    }
});

// KI-Antwort generieren
document.getElementById('generate-response-btn').addEventListener('click', async () => {
    const instruction = document.getElementById('response-instruction').value.trim();
    
    if (!instruction) {
        showError('Bitte geben Sie eine Anweisung für die KI ein.');
        return;
    }
    
    if (currentTicketHistory.length === 0) {
        showError('Bitte laden Sie zuerst ein Ticket.');
        return;
    }
    
    // Zeige Loading
    document.getElementById('generate-loading').style.display = 'block';
    document.getElementById('generate-response-btn').disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/generate-response`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                ticketHistory: currentTicketHistory,
                userInstruction: instruction
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Fehler bei der Antwortgenerierung');
        }
        
        // Zeige generierte Antwort
        // result.response ist ein Objekt mit { response, cost_info, model_used }
        const responseText = typeof result.response === 'object' ? result.response.response : result.response;
        document.getElementById('response-text').value = responseText;
        document.getElementById('generated-response-section').style.display = 'block';
        
        // Log verwendetes Modell in der Konsole
        const modelUsed = typeof result.response === 'object' ? result.response.model_used : 'Unbekannt';
        console.log(`✅ KI-Antwort generiert mit Modell: ${modelUsed}`);
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('generate-loading').style.display = 'none';
        document.getElementById('generate-response-btn').disabled = false;
    }
});

// Antwort senden
document.getElementById('send-response-btn').addEventListener('click', async () => {
    const responseText = document.getElementById('response-text').value.trim();
    const internal = document.getElementById('internal-note').checked;
    
    if (!responseText) {
        showError('Bitte geben Sie eine Antwort ein.');
        return;
    }
    
    if (!currentTicketId) {
        showError('Kein Ticket geladen.');
        return;
    }
    
    // Zeige Loading
    document.getElementById('send-loading').style.display = 'block';
    document.getElementById('send-response-btn').disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/ticket/${currentTicketId}/reply`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({
                body: responseText,
                internal: internal
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Fehler beim Senden der Antwort');
        }
        
        // Zeige Erfolgsmeldung
        document.getElementById('response-section').style.display = 'none';
        document.getElementById('response-success').style.display = 'block';
        
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('send-loading').style.display = 'none';
        document.getElementById('send-response-btn').disabled = false;
    }
});

// Neue Antwort Button
document.getElementById('new-response-btn').addEventListener('click', () => {
    // Reset
    document.getElementById('response-instruction').value = '';
    document.getElementById('response-text').value = '';
    document.getElementById('internal-note').checked = false;
    
    // Zeige Antwort-Bereich
    document.getElementById('response-success').style.display = 'none';
    document.getElementById('response-section').style.display = 'block';
    document.getElementById('generated-response-section').style.display = 'none';
});

// ========================================
// TEIL 3: EINSTELLUNGEN
// ========================================

// Einstellungen laden beim Öffnen der Seite
function loadSettingsIntoForm() {
    const creds = getApiCredentials();
    document.getElementById('ai-provider-select').value = creds.aiProvider;
    
    // Aktualisiere KI-Status im Header
    updateAIStatus();
    document.getElementById('settings-edenai-key').value = creds.edenAiKey;
    document.getElementById('edenai-model-select').value = creds.edenaiModel;
    document.getElementById('local-ai-url').value = creds.localAiUrl;
    document.getElementById('local-ai-key').value = creds.localAiKey;
    document.getElementById('local-ai-model').value = creds.localAiModel;
    document.getElementById('settings-zammad-url').value = creds.zammadUrl;
    document.getElementById('settings-zammad-token').value = creds.zammadToken;
    
    // Zeige/verstecke Provider-Konfiguration
    toggleProviderConfig();
    
    // Zeige/verstecke "Einstellungen laden" Button
    toggleLoadButton();
}

// Provider-Konfiguration ein-/ausblenden
function toggleProviderConfig() {
    const providerSelect = document.getElementById('ai-provider-select');
    const edenaiConfig = document.getElementById('edenai-config');
    const localConfig = document.getElementById('local-ai-config');
    
    if (providerSelect.value === 'local') {
        edenaiConfig.style.display = 'none';
        localConfig.style.display = 'block';
    } else {
        edenaiConfig.style.display = 'block';
        localConfig.style.display = 'none';
    }
}

// "Einstellungen laden" Button ein-/ausblenden
function toggleLoadButton() {
    // Button ist jetzt immer sichtbar - diese Funktion wird nicht mehr benötigt
    // aber wir behalten sie für Kompatibilität
}

// Einstellungen speichern & exportieren
document.getElementById('save-export-settings-btn').addEventListener('click', () => {
    const aiProvider = document.getElementById('ai-provider-select').value;
    const edenAiKey = document.getElementById('settings-edenai-key').value.trim();
    const edenaiModel = document.getElementById('edenai-model-select').value;
    const localAiUrl = document.getElementById('local-ai-url').value.trim();
    const localAiKey = document.getElementById('local-ai-key').value.trim();
    const localAiModel = document.getElementById('local-ai-model').value;
    const zammadUrl = document.getElementById('settings-zammad-url').value.trim();
    const zammadToken = document.getElementById('settings-zammad-token').value.trim();
    
    // Validierung basierend auf Provider
    if (!zammadUrl || !zammadToken) {
        showError('Bitte füllen Sie alle Zammad-Felder aus.');
        return;
    }
    
    if (aiProvider === 'edenai' && !edenAiKey) {
        showError('Bitte geben Sie Ihren Eden AI API-Schlüssel ein.');
        return;
    }
    
    if (aiProvider === 'local' && (!localAiUrl || !localAiKey)) {
        showError('Bitte geben Sie URL und API-Schlüssel für die lokale KI ein.');
        return;
    }
    
    // Entferne trailing slash von URLs
    const cleanZammadUrl = zammadUrl.replace(/\/$/, '');
    const cleanLocalUrl = localAiUrl.replace(/\/$/, '');
    
    // Speichere Einstellungen
    saveApiCredentials(aiProvider, edenAiKey, edenaiModel, cleanLocalUrl, localAiKey, localAiModel, cleanZammadUrl, zammadToken);
    
    // Aktualisiere KI-Status im Header
    updateAIStatus();
    
    // Lade Zammad-Gruppen neu
    loadZammadGroups().catch(err => {
        console.error('Fehler beim Laden der Gruppen nach Speichern:', err);
    });
    
    // Exportiere automatisch
    exportSettings();
    
    // Aktualisiere UI
    toggleLoadButton();
    
    showSuccess('Einstellungen gespeichert und exportiert! Sie können jetzt Tickets erstellen und beantworten.');
});

// Verbindung testen
document.getElementById('test-connection-btn').addEventListener('click', async () => {
    const edenAiKey = document.getElementById('settings-edenai-key').value.trim();
    const zammadUrl = document.getElementById('settings-zammad-url').value.trim();
    const zammadToken = document.getElementById('settings-zammad-token').value.trim();
    
    if (!edenAiKey || !zammadUrl || !zammadToken) {
        showError('Bitte füllen Sie alle Felder aus, bevor Sie die Verbindung testen.');
        return;
    }
    
    // Speichere temporär die Credentials für den Test
    const oldCreds = getApiCredentials();
    saveApiCredentials(oldCreds.aiProvider, edenAiKey, oldCreds.edenaiModel, oldCreds.localAiUrl, oldCreds.localAiKey, oldCreds.localAiModel, zammadUrl.replace(/\/$/, ''), zammadToken);
    
    const statusDiv = document.getElementById('connection-status');
    const loadingDiv = document.getElementById('test-loading');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (statusDiv) statusDiv.style.display = 'none';
    document.getElementById('test-connection-btn').disabled = true;
    
    try {
        // Teste Health-Endpunkt
        const response = await fetch(`${API_BASE}/health`);
        const result = await response.json();
        
        let statusHtml = '<div class="status-box success">';
        statusHtml += '<span>✅</span>';
        statusHtml += '<div><strong>Verbindung erfolgreich!</strong><br>';
        statusHtml += `Server Status: ${result.status}<br>`;
        statusHtml += `Eden AI: ${result.apis.edenai ? '✅ Konfiguriert' : '❌ Nicht konfiguriert'}<br>`;
        statusHtml += `Zammad: ${result.apis.zammad ? '✅ Konfiguriert' : '❌ Nicht konfiguriert'}`;
        statusHtml += '</div></div>';
        
        if (statusDiv) {
            statusDiv.innerHTML = statusHtml;
            statusDiv.style.display = 'block';
        }
        
        showSuccess('Verbindungstest erfolgreich!');
    } catch (error) {
        if (statusDiv) {
            statusDiv.innerHTML = `
                <div class="status-box warning">
                    <span>⚠️</span>
                    <div><strong>Verbindungsfehler:</strong><br>${error.message}</div>
                </div>
            `;
            statusDiv.style.display = 'block';
        }
        showError('Verbindungstest fehlgeschlagen: ' + error.message);
        
        // Stelle alte Credentials wieder her
        saveApiCredentials(oldCreds.aiProvider, oldCreds.edenAiKey, oldCreds.edenaiModel, oldCreds.localAiUrl, oldCreds.localAiKey, oldCreds.localAiModel, oldCreds.zammadUrl, oldCreds.zammadToken);
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
        document.getElementById('test-connection-btn').disabled = false;
    }
});

// Einstellungen löschen
document.getElementById('clear-settings-btn').addEventListener('click', () => {
    if (confirm('Möchten Sie wirklich alle gespeicherten API-Schlüssel löschen?')) {
        clearApiCredentials();
        loadSettingsIntoForm();
        showSuccess('Alle Einstellungen wurden gelöscht.');
    }
});

// Einstellungen laden Button
document.getElementById('load-settings-btn').addEventListener('click', () => {
    document.getElementById('load-file-input').click();
});

// File-Input für Laden
document.getElementById('load-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadSettings(file);
        // Reset file input
        e.target.value = '';
    }
});

// Modelle von lokalem Server laden
document.getElementById('load-models-btn').addEventListener('click', async () => {
    const localAiUrl = document.getElementById('local-ai-url').value.trim();
    const localAiKey = document.getElementById('local-ai-key').value.trim();
    
    if (!localAiUrl || !localAiKey) {
        showError('Bitte geben Sie zuerst die URL und den API-Schlüssel ein.');
        return;
    }
    
    const loadingDiv = document.getElementById('models-loading');
    const loadBtn = document.getElementById('load-models-btn');
    const modelSelect = document.getElementById('local-ai-model');
    
    loadingDiv.style.display = 'block';
    loadBtn.disabled = true;
    
    try {
        // Verwende Backend-Proxy statt direktem Zugriff (wegen HTTPS/HTTP Mixed Content)
        const response = await fetch(`${API_BASE}/local-models`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apiUrl: localAiUrl,
                apiKey: localAiKey
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            throw new Error('Keine Modelle gefunden');
        }
        
        // Filtere nur Text-Modelle (keine Vision-Modelle für bessere Übersicht)
        const textModels = data.data.filter(model => {
            const name = model.id.toLowerCase();
            return !name.includes('vision') && !name.includes('llava') && !name.includes('embed');
        });
        
        // Sortiere Modelle: Empfohlene zuerst
        const recommendedModels = ['llama3.1:latest', 'Phi4:latest', 'gemma2:latest'];
        textModels.sort((a, b) => {
            const aIndex = recommendedModels.indexOf(a.id);
            const bIndex = recommendedModels.indexOf(b.id);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.id.localeCompare(b.id);
        });
        
        // Fülle Dropdown
        modelSelect.innerHTML = '';
        textModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            
            // Füge Empfehlungs-Badge hinzu
            let label = model.name || model.id;
            if (model.id === 'llama3.1:latest') {
                label += ' ⭐ (Empfohlen)';
            } else if (model.id === 'Phi4:latest') {
                label += ' ⭐⭐ (Beste Qualität)';
            } else if (model.id === 'gemma2:latest') {
                label += ' ⭐ (Schnell)';
            }
            
            option.textContent = label;
            modelSelect.appendChild(option);
        });
        
        // Wähle llama3.1 als Standard, falls vorhanden
        if (textModels.some(m => m.id === 'llama3.1:latest')) {
            modelSelect.value = 'llama3.1:latest';
        }
        
        showSuccess(`${textModels.length} Modelle erfolgreich geladen!`);
        console.log('Verfügbare Modelle:', textModels.map(m => m.id).join(', '));
        
    } catch (error) {
        console.error('Fehler beim Laden der Modelle:', error);
        showError(`Fehler beim Laden der Modelle: ${error.message}`);
        
        // Fallback: Zeige Standard-Optionen
        modelSelect.innerHTML = `
            <option value="llama3.1:latest">llama3.1:latest ⭐ (Empfohlen)</option>
            <option value="Phi4:latest">Phi4:latest ⭐⭐ (Beste Qualität)</option>
            <option value="gemma2:latest">gemma2:latest ⭐ (Schnell)</option>
            <option value="llama3.2:latest">llama3.2:latest</option>
            <option value="phi3:latest">phi3:latest</option>
        `;
    } finally {
        loadingDiv.style.display = 'none';
        loadBtn.disabled = false;
    }
});

// ========================================
// EXPORT/IMPORT FUNCTIONS
// ========================================

// Einstellungen exportieren
function exportSettings() {
    const creds = getApiCredentials();
    
    if (!creds.zammadUrl && !creds.zammadToken) {
        showError('Keine Einstellungen zum Exportieren vorhanden.');
        return;
    }
    
    const exportData = {
        version: '2.0',
        timestamp: new Date().toISOString(),
        description: 'Zammad KI-Integration - Alle Einstellungen',
        settings: {
            aiProvider: creds.aiProvider,
            edenAiKey: creds.edenAiKey,
            edenaiModel: creds.edenaiModel,
            localAiUrl: creds.localAiUrl,
            localAiKey: creds.localAiKey,
            localAiModel: creds.localAiModel,
            zammadUrl: creds.zammadUrl,
            zammadToken: creds.zammadToken
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `zammad-ki-settings-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showSuccess('Einstellungen erfolgreich exportiert!');
}

// Einstellungen laden
function loadSettings(file) {
    if (!file) {
        showError('Keine Datei ausgewählt.');
        return;
    }
    
    if (!file.name.endsWith('.json')) {
        showError('Bitte wählen Sie eine JSON-Datei aus.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Validierung der Import-Daten
            if (!importData.settings) {
                throw new Error('Ungültige Datei: Keine Einstellungen gefunden.');
            }
            
            const settings = importData.settings;
            
            // Lade alle Einstellungen in die Formularfelder
            document.getElementById('ai-provider-select').value = settings.aiProvider || 'edenai';
            document.getElementById('settings-edenai-key').value = settings.edenAiKey || '';
            document.getElementById('edenai-model-select').value = settings.edenaiModel || 'openai';
            document.getElementById('local-ai-url').value = settings.localAiUrl || 'https://ki.kmzserver.de';
            document.getElementById('local-ai-key').value = settings.localAiKey || '';
            document.getElementById('local-ai-model').value = settings.localAiModel || 'llama3';
            document.getElementById('settings-zammad-url').value = settings.zammadUrl || '';
            document.getElementById('settings-zammad-token').value = settings.zammadToken || '';
            
            // Aktualisiere UI
            toggleProviderConfig();
            toggleLoadButton();
            
            showSuccess('Einstellungen erfolgreich geladen! Sie können sie jetzt speichern.');
            
        } catch (error) {
            showError(`Fehler beim Laden: ${error.message}`);
        }
    };
    
    reader.readAsText(file);
}

// ========================================
// KUNDEN-ÜBERSICHT
// ========================================

// Suchtyp-Labels aktualisieren
function updateSearchLabels() {
    const searchType = document.getElementById('search-type').value;
    const searchLabel = document.getElementById('search-label');
    const searchInput = document.getElementById('search-input');
    const searchHint = document.getElementById('search-hint');
    
    if (searchType === 'customer') {
        searchLabel.textContent = 'Kundensuche:';
        searchInput.placeholder = 'Name oder E-Mail eingeben...';
        searchHint.textContent = 'Mindestens 2 Zeichen eingeben für Vorschläge';
    } else {
        searchLabel.textContent = 'Organisationsname:';
        searchInput.placeholder = 'Beispiel GmbH';
        searchHint.textContent = 'Name der Organisation eingeben';
    }
    
    // Reset Auswahl
    selectedCustomer = null;
    document.getElementById('selected-customer').style.display = 'none';
    document.getElementById('customer-suggestions').style.display = 'none';
}

// Kundensuche mit Autocomplete
async function searchCustomersAutocomplete(query) {
    if (query.length < 2) {
        document.getElementById('customer-suggestions').style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/search-customers?query=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers: getApiHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success && result.customers.length > 0) {
            displayCustomerSuggestions(result.customers);
        } else {
            document.getElementById('customer-suggestions').innerHTML = '<div class="suggestion-item" style="color: #6c757d;">Keine Kunden gefunden</div>';
            document.getElementById('customer-suggestions').style.display = 'block';
        }
    } catch (error) {
        console.error('Fehler bei der Kundensuche:', error);
        document.getElementById('customer-suggestions').style.display = 'none';
    }
}

// Kunden-Vorschläge anzeigen
function displayCustomerSuggestions(customers) {
    const suggestionsDiv = document.getElementById('customer-suggestions');
    
    suggestionsDiv.innerHTML = customers.map(customer => `
        <div class="suggestion-item" data-customer='${JSON.stringify(customer)}'>
            <span class="suggestion-name">${customer.fullname || 'Unbekannt'}</span>
            <span class="suggestion-email">${customer.email}</span>
            ${customer.organization ? `<span class="suggestion-org">🏢 ${customer.organization}</span>` : ''}
        </div>
    `).join('');
    
    suggestionsDiv.style.display = 'block';
    
    // Event Listener für Auswahl
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', function() {
            const customerData = JSON.parse(this.dataset.customer);
            selectCustomer(customerData);
        });
    });
}

// Kunde auswählen
function selectCustomer(customer) {
    selectedCustomer = customer;
    
    // Verstecke Vorschläge
    document.getElementById('customer-suggestions').style.display = 'none';
    document.getElementById('search-input').value = '';
    
    // Zeige ausgewählten Kunden
    const selectedDiv = document.getElementById('selected-customer');
    selectedDiv.innerHTML = `
        <div class="selected-customer-name">👤 ${customer.fullname}</div>
        <div class="selected-customer-email">📧 ${customer.email}</div>
        ${customer.organization ? `<div class="selected-customer-org">🏢 ${customer.organization}</div>` : ''}
        <button class="selected-customer-remove" onclick="clearSelectedCustomer()">✕ Auswahl aufheben</button>
    `;
    selectedDiv.style.display = 'block';
}

// Auswahl aufheben
function clearSelectedCustomer() {
    selectedCustomer = null;
    document.getElementById('selected-customer').style.display = 'none';
    document.getElementById('search-input').value = '';
}

// Tickets suchen
async function searchTickets() {
    const searchType = document.getElementById('search-type').value;
    const includeSummary = document.getElementById('include-summary').checked;
    
    // Prüfe ob Zammad konfiguriert ist
    const creds = getApiCredentials();
    if (!creds.zammadUrl || !creds.zammadToken) {
        showError('Bitte konfigurieren Sie zuerst die Zammad-Einstellungen in den Einstellungen.');
        return;
    }
    
    // Für Kunden: Prüfe ob ein Kunde ausgewählt wurde
    if (searchType === 'customer') {
        if (!selectedCustomer) {
            showError('Bitte wählen Sie zuerst einen Kunden aus den Vorschlägen aus.');
            return;
        }
    } else {
        // Für Organisationen: Verwende Eingabefeld
        const searchInput = document.getElementById('search-input').value.trim();
        if (!searchInput) {
            showError('Bitte geben Sie einen Organisationsnamen ein.');
            return;
        }
    }
    
    // Zeige Loading
    document.getElementById('overview-loading').style.display = 'block';
    document.getElementById('overview-results').style.display = 'none';
    document.getElementById('search-tickets-btn').disabled = true;
    
    try {
        const endpoint = searchType === 'customer' ? '/customer-tickets' : '/organization-tickets';
        const requestBody = {
            [searchType === 'customer' ? 'email' : 'organizationName']: searchType === 'customer' ? selectedCustomer.email : document.getElementById('search-input').value.trim(),
            includeSummary: includeSummary
        };
        
        if (includeSummary) {
            requestBody.model = creds.aiProvider === 'local' ? 'local' : creds.edenaiModel;
            if (creds.aiProvider === 'local') {
                requestBody.localConfig = {
                    url: creds.localAiUrl,
                    apiKey: creds.localAiKey,
                    model: creds.localAiModel
                };
            }
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
            // Bestimme den Anzeigenamen basierend auf Typ
            const displayName = searchType === 'customer' ? selectedCustomer.fullname : document.getElementById('search-input').value.trim();
            displayOverviewResults(result, searchType, displayName);
        } else {
            // Zeige detaillierte Fehlermeldung
            const errorMsg = result.error || 'Unbekannter Fehler';
            const details = result.details ? `\nDetails: ${result.details}` : '';
            throw new Error(`${errorMsg}${details}`);
        }
        
    } catch (error) {
        console.error('Fehler bei der Ticketsuche:', error);
        showError(`Fehler bei der Ticketsuche: ${error.message}`);
    } finally {
        document.getElementById('overview-loading').style.display = 'none';
        document.getElementById('search-tickets-btn').disabled = false;
    }
}

// Übersichtsergebnisse anzeigen
function displayOverviewResults(result, searchType, searchInput) {
    const { ticketCount, tickets, summary } = result;
    
    // Header aktualisieren
    document.getElementById('overview-title').textContent = 
        searchType === 'customer' ? `Kunde: ${searchInput}` : `Organisation: ${searchInput}`;
    document.getElementById('ticket-count').textContent = ticketCount;
    
    // Zeitraum berechnen
    if (tickets.length > 0) {
        const dates = tickets.map(t => new Date(t.created_at)).sort();
        const oldest = dates[0];
        const newest = dates[dates.length - 1];
        const timeRange = `${oldest.toLocaleDateString()} - ${newest.toLocaleDateString()}`;
        document.getElementById('time-range').textContent = timeRange;
    }
    
    // KI-Zusammenfassung anzeigen
    if (summary) {
        document.getElementById('ai-summary').style.display = 'block';
        document.getElementById('summary-content').textContent = summary.summary;
        
        if (summary.cost_info) {
            document.getElementById('summary-cost').style.display = 'block';
            document.getElementById('summary-cost').innerHTML = `
                <strong>Kosten:</strong> ${summary.cost_info.cost || 0} ${summary.cost_info.currency || 'EUR'} 
                (${summary.cost_info.total_tokens || 0} Tokens) | 
                <strong>Modell:</strong> ${summary.model_used}
            `;
        }
    } else {
        document.getElementById('ai-summary').style.display = 'none';
    }
    
    // Ticket-Liste anzeigen
    displayTicketsList(tickets);
    
    // Ergebnisse anzeigen
    document.getElementById('overview-results').style.display = 'block';
}

// Ticket-Liste anzeigen
function displayTicketsList(tickets) {
    const container = document.getElementById('tickets-container');
    
    if (tickets.length === 0) {
        container.innerHTML = '<p class="text-muted">Keine Tickets gefunden.</p>';
        return;
    }
    
    // Hole Zammad URL aus den Einstellungen
    const creds = getApiCredentials();
    const zammadUrl = creds.zammadUrl || '';
    
    container.innerHTML = tickets.map(ticket => {
        const createdDate = new Date(ticket.created_at).toLocaleDateString('de-DE');
        const statusClass = getStatusClass(ticket.state?.name);
        const firstArticle = ticket.articles?.[0];
        const preview = firstArticle?.body?.substring(0, 150) + '...' || 'Keine Nachricht';
        
        // Erstelle Link zu Zammad Ticket
        const ticketUrl = zammadUrl ? `${zammadUrl}/#ticket/zoom/${ticket.id}` : '#';
        const linkTarget = zammadUrl ? '_blank' : '_self';
        
        return `
            <div class="ticket-item">
                <div class="ticket-header">
                    <h5 class="ticket-title">
                        <a href="${ticketUrl}" target="${linkTarget}" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                            ${ticket.title}
                        </a>
                    </h5>
                    <div class="ticket-meta">
                        <span class="ticket-status ${statusClass}">${ticket.state?.name || 'Unbekannt'}</span>
                        <a href="${ticketUrl}" target="${linkTarget}" rel="noopener noreferrer" style="color: #007bff; text-decoration: none;">
                            #${ticket.number || ticket.id}
                        </a>
                        <span>${createdDate}</span>
                    </div>
                </div>
                <div class="ticket-preview">${preview}</div>
            </div>
        `;
    }).join('');
}

// Status-Klasse für CSS
function getStatusClass(status) {
    if (!status) return 'pending';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('offen') || statusLower.includes('open')) return 'open';
    if (statusLower.includes('geschlossen') || statusLower.includes('closed')) return 'closed';
    return 'pending';
}

// Übersicht zurücksetzen
function clearOverview() {
    document.getElementById('search-input').value = '';
    document.getElementById('overview-results').style.display = 'none';
    document.getElementById('ai-summary').style.display = 'none';
    selectedCustomer = null;
    document.getElementById('selected-customer').style.display = 'none';
    document.getElementById('customer-suggestions').style.display = 'none';
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function showError(message) {
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');
    
    errorMessage.textContent = message;
    errorAlert.style.display = 'flex';
    
    // Auto-hide nach 8 Sekunden
    setTimeout(() => {
        errorAlert.style.display = 'none';
    }, 8000);
}

function closeError() {
    document.getElementById('error-alert').style.display = 'none';
}

function showSuccess(message) {
    const successAlert = document.getElementById('success-alert');
    const successMessage = document.getElementById('success-message');
    
    successMessage.textContent = message;
    successAlert.style.display = 'flex';
    
    // Auto-hide nach 5 Sekunden
    setTimeout(() => {
        successAlert.style.display = 'none';
    }, 5000);
}

function closeSuccess() {
    document.getElementById('success-alert').style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// INITIALISIERUNG
// ========================================

console.log('🚀 Zammad KI-Integration geladen');

// Chatbot initialisieren
initChatbot();

// Event Listener für Provider-Auswahl
document.getElementById('ai-provider-select').addEventListener('change', toggleProviderConfig);

// Event Listener für Suchtyp-Änderung
document.getElementById('search-type').addEventListener('change', updateSearchLabels);

// Event Listener für Autocomplete
document.getElementById('search-input').addEventListener('input', function(e) {
    const searchType = document.getElementById('search-type').value;
    
    if (searchType === 'customer') {
        // Debounce: Warte 300ms nach letzter Eingabe
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchCustomersAutocomplete(e.target.value);
        }, 300);
    }
});

// Verstecke Vorschläge bei Klick außerhalb
document.addEventListener('click', function(e) {
    if (!e.target.closest('.autocomplete-wrapper')) {
        document.getElementById('customer-suggestions').style.display = 'none';
    }
});

// Event Listener für Kunden-Übersicht
document.getElementById('search-tickets-btn').addEventListener('click', searchTickets);
document.getElementById('clear-overview-btn').addEventListener('click', clearOverview);

// Lade Einstellungen beim Start
loadSettingsIntoForm();

// Prüfe ob Credentials konfiguriert sind
if (!areCredentialsConfigured()) {
    console.warn('⚠️ API-Schlüssel nicht konfiguriert!');
    setTimeout(() => {
        showError('Bitte konfigurieren Sie Ihre API-Schlüssel im Einstellungen-Tab.');
    }, 1000);
} else {
    // Lade Zammad-Gruppen wenn Credentials vorhanden sind
    loadZammadGroups().catch(err => {
        console.error('Fehler beim initialen Laden der Gruppen:', err);
    });
}

// Erweitere Tab-Navigation um Einstellungen-Laden
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        if (button.dataset.tab === 'settings') {
            loadSettingsIntoForm();
        }
    });
});

// Health Check
fetch(`${API_BASE}/health`)
    .then(res => res.json())
    .then(data => {
        console.log('Server Status:', data);
        if (!data.apis.edenai || !data.apis.zammad) {
            console.warn('⚠️ Einige APIs sind nicht in .env konfiguriert (verwende LocalStorage)');
        }
    })
    .catch(err => {
        console.error('❌ Server nicht erreichbar:', err);
        showError('Server nicht erreichbar. Bitte starten Sie die Anwendung neu.');
    });

// ========================================
// PASSWORD TOGGLE FUNCTION
// ========================================

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.toggle-password-btn');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

// ========================================
// CHATBOT FUNKTIONALITÄT
// ========================================

let chatHistory = []; // Chat-Verlauf speichern

// Chatbot initialisieren
function initChatbot() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatClearBtn = document.getElementById('chat-clear-btn');
    const chatStatus = document.getElementById('chat-status');
    const welcomeTime = document.getElementById('welcome-time');
    
    // Willkommenszeit setzen
    if (welcomeTime) {
        welcomeTime.textContent = new Date().toLocaleTimeString('de-DE');
    }
    
    // Event Listeners
    if (chatInput) {
        chatInput.addEventListener('input', handleChatInput);
        chatInput.addEventListener('keydown', handleChatKeydown);
    }
    
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }
    
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', clearChat);
    }
    
    // Upload Button Event Listener
    const chatUploadBtn = document.getElementById('chat-upload-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    
    if (chatUploadBtn && chatFileInput) {
        chatUploadBtn.addEventListener('click', () => {
            chatFileInput.click();
        });
        
        chatFileInput.addEventListener('change', handleDocumentUpload);
    }
    
    // Initiale Button-Status
    updateChatSendButton();
}

// Chat Input Handler
function handleChatInput() {
    updateChatSendButton();
}

// Chat Keydown Handler
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

// Send Button Status aktualisieren
function updateChatSendButton() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    
    if (chatInput && chatSendBtn) {
        const hasText = chatInput.value.trim().length > 0;
        chatSendBtn.disabled = !hasText;
    }
}

// Chat-Nachricht senden
async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const chatStatus = document.getElementById('chat-status');
    
    if (!chatInput || !chatMessages) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Benutzer-Nachricht hinzufügen
    addChatMessage(message, 'user');
    
    // Input leeren und Button deaktivieren
    chatInput.value = '';
    updateChatSendButton();
    
    // Status auf "Tippt..." setzen
    updateChatStatus('typing', 'KI antwortet...');
    
    // Typing-Indikator anzeigen
    showTypingIndicator();
    
    try {
        // Wenn ein Dokument hochgeladen wurde, füge den Text zur Nachricht hinzu
        let finalMessage = message;
        if (window.currentDocumentText && window.currentDocumentName) {
            finalMessage = `${message}\n\n[Dokument: ${window.currentDocumentName}]\n\n${window.currentDocumentText}`;
            
            // Nach Verwendung löschen
            delete window.currentDocumentText;
            delete window.currentDocumentName;
        }
        
        // API-Call
        const result = await sendChatToAPI(finalMessage);
        
        // Typing-Indikator entfernen
        hideTypingIndicator();
        
        // Bot-Antwort hinzufügen
        addChatMessage(result.response, 'bot');
        
        // Chat-Historie aktualisieren (nur mit der ursprünglichen Nachricht, nicht mit vollem Dokument-Text)
        chatHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: result.response }
        );
        
        console.log(`Chat-Historie aktualisiert. Neue Länge: ${chatHistory.length}`);
        console.log('Aktuelle Historie:', chatHistory);
        
        // Status auf "Bereit" setzen
        updateChatStatus('ready', 'Bereit');
        
        // Kosten anzeigen falls verfügbar
        if (result.cost_info) {
            displayCostInfo(result.cost_info, 'chat-cost-info');
        }
        
    } catch (error) {
        console.error('Chat-Fehler:', error);
        
        // Typing-Indikator entfernen
        hideTypingIndicator();
        
        // Fehler-Nachricht anzeigen
        addChatMessage(`Fehler: ${error.message}`, 'bot', true);
        
        // Status auf "Fehler" setzen
        updateChatStatus('error', 'Fehler aufgetreten');
    }
}

// Chat-Nachricht an API senden
async function sendChatToAPI(message) {
    const creds = getApiCredentials();
    
    // Headers für API-Call
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // KI-Provider spezifische Headers
    if (creds.aiProvider === 'edenai' && creds.edenAiKey) {
        headers['X-Eden-AI-Key'] = creds.edenAiKey;
    }
    
    // Request Body mit Chat-Historie
    const body = {
        message: message,
        model: creds.aiProvider === 'edenai' ? creds.edenaiModel : 'local',
        localConfig: creds.aiProvider === 'local' ? {
            apiUrl: creds.localAiUrl,
            apiKey: creds.localAiKey,
            model: creds.localAiModel
        } : null,
        chatHistory: chatHistory  // Füge Chat-Historie hinzu
    };
    
    console.log(`Sende Chat-Request mit ${chatHistory.length} Nachrichten in der Historie`);
    
    const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'API-Fehler');
    }
    
    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || 'Unbekannter Fehler');
    }
    
    return result;
}

// Chat-Nachricht hinzufügen
function addChatMessage(text, sender, isError = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = sender === 'user' ? '👤' : (isError ? '❌' : '🤖');
    const time = new Date().toLocaleTimeString('de-DE');
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-text">${escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    
    // Nach unten scrollen
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Typing-Indikator anzeigen
function showTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span>KI tippt</span>
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Typing-Indikator entfernen
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Chat-Status aktualisieren
function updateChatStatus(status, text) {
    const chatStatus = document.getElementById('chat-status');
    if (!chatStatus) return;
    
    const indicator = chatStatus.querySelector('.status-indicator');
    const statusText = chatStatus.querySelector('.status-text');
    
    if (indicator) {
        indicator.className = `status-indicator ${status}`;
    }
    
    if (statusText) {
        statusText.textContent = text;
    }
}

// Chat leeren
function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    // Bestätigung
    if (!confirm('Möchten Sie wirklich den gesamten Chat-Verlauf löschen?')) {
        return;
    }
    
    // Alle Nachrichten außer der Willkommensnachricht entfernen
    const messages = chatMessages.querySelectorAll('.message');
    messages.forEach(message => {
        if (!message.querySelector('#welcome-time')) {
            message.remove();
        }
    });
    
    // Chat-Historie leeren
    chatHistory = [];
    console.log('Chat-Historie wurde geleert. Länge:', chatHistory.length);
    
    // Status zurücksetzen
    updateChatStatus('ready', 'Bereit');
    
    // Input fokussieren
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.focus();
    }
}

// Dokument-Upload Handler
async function handleDocumentUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Dateigröße prüfen (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('Datei ist zu groß! Maximale Größe: 10 MB');
        event.target.value = '';
        return;
    }
    
    // Status aktualisieren
    updateChatStatus('processing', 'Verarbeite Dokument...');
    
    // Dokument-Badge zur Chat-UI hinzufügen (Processing)
    const documentBadge = addDocumentBadge(file.name, file.size, true);
    
    try {
        // FormData erstellen
        const formData = new FormData();
        formData.append('document', file);
        
        // Zu Backend hochladen
        const response = await fetch(`${API_BASE}/upload-document`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload fehlgeschlagen');
        }
        
        const result = await response.json();
        
        console.log('📄 Dokument verarbeitet:', result.filename, `(${result.stats.words} Wörter)`);
        
        // Badge aktualisieren (Processing -> Fertig)
        updateDocumentBadge(documentBadge, result.stats);
        
        // Automatische Nachricht an Chat senden
        const message = `Ich habe das Dokument "${result.filename}" hochgeladen. Bitte analysiere es und fasse den Inhalt zusammen.`;
        
        // Text in Input setzen
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = message;
            updateChatSendButton();
        }
        
        // Dokumententext im Hintergrund speichern (für später)
        window.currentDocumentText = result.text;
        window.currentDocumentName = result.filename;
        
        updateChatStatus('ready', 'Bereit');
        
    } catch (error) {
        console.error('Fehler beim Dokument-Upload:', error);
        alert(`❌ Fehler: ${error.message}`);
        
        // Badge entfernen bei Fehler
        if (documentBadge) {
            documentBadge.remove();
        }
        
        updateChatStatus('ready', 'Bereit');
    } finally {
        // File Input zurücksetzen
        event.target.value = '';
    }
}

// Dokument-Badge zur Chat-UI hinzufügen
function addDocumentBadge(filename, filesize, isProcessing = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return null;
    
    const badge = document.createElement('div');
    badge.className = `document-badge ${isProcessing ? 'document-processing' : ''}`;
    
    const icon = getDocumentIcon(filename);
    const sizeText = formatFileSize(filesize);
    
    badge.innerHTML = `
        <div class="document-icon">${icon}</div>
        <div class="document-info">
            <div class="document-name">${filename}</div>
            <div class="document-stats">
                <span>📦 ${sizeText}</span>
                <span id="doc-words">⏳ Verarbeite...</span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(badge);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return badge;
}

// Badge aktualisieren nach erfolgreicher Verarbeitung
function updateDocumentBadge(badge, stats) {
    if (!badge) return;
    
    badge.classList.remove('document-processing');
    
    const wordsSpan = badge.querySelector('#doc-words');
    if (wordsSpan) {
        wordsSpan.innerHTML = `📝 ${stats.words.toLocaleString('de-DE')} Wörter`;
        
        if (stats.pages) {
            wordsSpan.innerHTML += ` • 📄 ${stats.pages} Seite${stats.pages > 1 ? 'n' : ''}`;
        }
    }
}

// Icon für Dateityp
function getDocumentIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '📕',
        'doc': '📘',
        'docx': '📘',
        'txt': '📄',
        'md': '📝',
        'csv': '📊'
    };
    return icons[ext] || '📎';
}

// Dateigröße formatieren
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// HTML escapen
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

