const axios = require('axios');
const https = require('https');

/**
 * Erstelle Zammad API Client
 * @param {string} baseURL - Zammad API URL
 * @param {string} token - API Token
 * @returns {Object} Axios-Instanz
 */
function createZammadClient(baseURL, token) {
  return axios.create({
    baseURL: baseURL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    // Deaktiviere SSL-Verifikation für abgelaufene Zertifikate
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });
}

/**
 * Sucht einen Kunden anhand der E-Mail-Adresse
 * @param {string} email - E-Mail-Adresse
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object|null>} Kunde oder null
 */
async function findCustomerByEmail(email, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get('/api/v1/users/search', {
      params: { query: email }
    });

    const users = response.data;
    
    // Finde exakte E-Mail-Übereinstimmung
    const customer = users.find(user => 
      user.email && user.email.toLowerCase() === email.toLowerCase()
    );

    return customer || null;
  } catch (error) {
    console.error('Fehler bei der Kundensuche:', error.response?.data || error.message);
    throw new Error(`Kundensuche fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Sucht Kunden anhand eines Suchbegriffs (Name, E-Mail, etc.)
 * @param {string} searchTerm - Suchbegriff
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @param {number} limit - Maximale Anzahl Ergebnisse (Standard: 10)
 * @returns {Promise<Array>} Array mit Kunden
 */
async function searchCustomers(searchTerm, zammadUrl, zammadToken, limit = 10) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get('/api/v1/users/search', {
      params: { 
        query: searchTerm,
        limit: limit
      }
    });

    const users = response.data || [];
    
    // Filtere nur Kunden (keine Agenten)
    const customers = users.filter(user => {
      const roles = user.role_ids || [];
      // Typische Customer-Rolle IDs: 3
      // Filtere Agenten und Admins aus
      return !user.roles?.some(role => 
        role.name === 'Admin' || 
        role.name === 'Agent'
      );
    });
    
    // Formatiere Ergebnisse
    const formattedCustomers = customers.map(user => ({
      id: user.id,
      email: user.email,
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      fullname: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
      organization: user.organization || null,
      organization_id: user.organization_id || null
    }));
    
    console.log(`Gefunden: ${formattedCustomers.length} Kunden für "${searchTerm}"`);
    
    return formattedCustomers;
  } catch (error) {
    console.error('Fehler bei der Kundensuche:', error.response?.data || error.message);
    throw new Error(`Kundensuche fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Sucht eine Organisation anhand des Namens
 * @param {string} name - Organisationsname
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object|null>} Organisation oder null
 */
async function findOrganizationByName(name, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get('/api/v1/organizations/search', {
      params: { query: name }
    });

    const organizations = response.data;
    
    // Finde exakte Namensübereinstimmung
    const organization = organizations.find(org => 
      org.name && org.name.toLowerCase() === name.toLowerCase()
    );

    return organization || null;
  } catch (error) {
    console.error('Fehler bei der Organisationssuche:', error.response?.data || error.message);
    throw new Error(`Organisationssuche fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Erstellt eine neue Organisation oder gibt die existierende zurück
 * @param {string} name - Organisationsname
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object>} Organisation
 */
async function findOrCreateOrganization(name, zammadUrl, zammadToken) {
  // Prüfe zuerst, ob Organisation existiert
  const existing = await findOrganizationByName(name, zammadUrl, zammadToken);
  if (existing) {
    return existing;
  }

  // Erstelle neue Organisation
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.post('/api/v1/organizations', {
      name: name,
      active: true
    });

    return response.data;
  } catch (error) {
    console.error('Fehler beim Erstellen der Organisation:', error.response?.data || error.message);
    throw new Error(`Organisation konnte nicht erstellt werden: ${error.message}`);
  }
}

/**
 * Erstellt einen neuen Kunden oder gibt den existierenden zurück
 * @param {Object} customerData - Kundendaten
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object>} Kunde
 */
async function findOrCreateCustomer(customerData, zammadUrl, zammadToken) {
  const { email, name, organization_id } = customerData;

  // Prüfe zuerst, ob Kunde existiert
  const existing = await findCustomerByEmail(email, zammadUrl, zammadToken);
  if (existing) {
    // Aktualisiere Organisation, falls angegeben
    if (organization_id && existing.organization_id !== organization_id) {
      try {
        const client = createZammadClient(zammadUrl, zammadToken);
        const updateResponse = await client.put(`/api/v1/users/${existing.id}`, {
          organization_id: organization_id
        });
        return updateResponse.data;
      } catch (error) {
        console.warn('Organisation konnte nicht aktualisiert werden:', error.message);
        return existing;
      }
    }
    return existing;
  }

  // Erstelle neuen Kunden
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    
    // Hole die Customer-Rolle ID
    const rolesResponse = await client.get('/api/v1/roles');
    console.log('Verfügbare Rollen in Zammad:', rolesResponse.data.map(r => `${r.name} (ID: ${r.id})`).join(', '));
    
    // Suche nach Customer-Rolle (englisch oder deutsch)
    const customerRole = rolesResponse.data.find(role => 
      role.name === 'Customer' || 
      role.name === 'Kunde' ||
      role.name.toLowerCase().includes('customer') ||
      role.name.toLowerCase().includes('kunde')
    );
    
    if (!customerRole) {
      // Fallback: Verwende ID 3 (Standard-Customer-Rolle in Zammad)
      console.warn('Customer-Rolle nicht gefunden, verwende Fallback ID 3');
      const response = await client.post('/api/v1/users', {
        firstname: (name || email.split('@')[0]).split(' ')[0] || '',
        lastname: (name || email.split('@')[0]).split(' ').slice(1).join(' ') || '',
        email: email,
        organization_id: organization_id || null,
        role_ids: [3] // Standard Customer-Rolle ID
      });
      return response.data;
    }
    
    // Splitte Name in Vor- und Nachname
    const nameParts = (name || email.split('@')[0]).split(' ');
    const firstname = nameParts[0] || '';
    const lastname = nameParts.slice(1).join(' ') || '';

    const response = await client.post('/api/v1/users', {
      firstname: firstname,
      lastname: lastname,
      email: email,
      organization_id: organization_id || null,
      role_ids: [customerRole.id]
    });

    return response.data;
  } catch (error) {
    console.error('Fehler beim Erstellen des Kunden:', error.response?.data || error.message);
    throw new Error(`Kunde konnte nicht erstellt werden: ${error.message}`);
  }
}

/**
 * Erstellt ein neues Ticket
 * @param {Object} ticketData - Ticketdaten
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object>} Erstelltes Ticket
 */
async function createTicket(ticketData, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const { title, group, customer_id, article } = ticketData;

    // Hole Gruppen-ID
    let groupId;
    if (typeof group === 'string') {
      const groups = await client.get('/api/v1/groups');
      console.log('Verfügbare Gruppen:', groups.data.map(g => `${g.name} (ID: ${g.id})`).join(', '));
      
      const foundGroup = groups.data.find(g => 
        g.name.toLowerCase() === group.toLowerCase()
      );
      
      if (!foundGroup) {
        // Fallback: Verwende die erste aktive Gruppe
        const activeGroup = groups.data.find(g => g.active !== false);
        groupId = activeGroup ? activeGroup.id : 1; // Fallback zu ID 1
        console.log(`Gruppe "${group}" nicht gefunden, verwende Fallback: ${activeGroup?.name || 'ID 1'}`);
      } else {
        groupId = foundGroup.id;
      }
    } else {
      groupId = group;
    }

    // Hole Kundendaten für den Artikel
    const customer = await client.get(`/api/v1/users/${customer_id}`);
    const customerEmail = customer.data.email;
    const customerName = `${customer.data.firstname} ${customer.data.lastname}`.trim() || customerEmail;
    
    // Bestimme Artikel-Typ und zusätzliche Felder
    const articleType = article.type || 'note';
    const articleData = {
      subject: article.subject || title,
      body: article.body,
      type: articleType,
      internal: article.internal !== undefined ? article.internal : false,
      sender: 'Customer' // Markiere als vom Kunden gesendet
    };
    
    // Füge E-Mail-spezifische Felder hinzu, wenn Typ 'email' ist
    if (articleType === 'email') {
      articleData.from = customerEmail; // Setze den Kunden als Absender
      articleData.to = 'support@kmzhn.de'; // Ziel-Adresse (wird von Zammad automatisch gesetzt)
    }
    
    const response = await client.post('/api/v1/tickets', {
      title: title,
      group_id: groupId,
      customer_id: customer_id,
      article: articleData
    });

    return response.data;
  } catch (error) {
    console.error('Fehler beim Erstellen des Tickets:', error.response?.data || error.message);
    throw new Error(`Ticket konnte nicht erstellt werden: ${error.message}`);
  }
}

/**
 * Lädt ein Ticket anhand der ID
 * @param {string} ticketId - Ticket-ID
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object>} Ticket
 */
async function getTicket(ticketId, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get(`/api/v1/tickets/${ticketId}`, {
      params: { expand: true } // Erweitere Antwort um verknüpfte Objekte
    });
    return response.data;
  } catch (error) {
    console.error('Fehler beim Laden des Tickets:', error.response?.data || error.message);
    throw new Error(`Ticket konnte nicht geladen werden: ${error.message}`);
  }
}

/**
 * Lädt alle Artikel (Nachrichten) eines Tickets
 * @param {string} ticketId - Ticket-ID
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Array>} Array mit Artikeln
 */
async function getTicketArticles(ticketId, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get(`/api/v1/ticket_articles/by_ticket/${ticketId}`);
    return response.data;
  } catch (error) {
    console.error('Fehler beim Laden der Ticket-Artikel:', error.response?.data || error.message);
    throw new Error(`Ticket-Artikel konnten nicht geladen werden: ${error.message}`);
  }
}

/**
 * Fügt einem Ticket einen neuen Artikel (Antwort) hinzu
 * @param {string} ticketId - Ticket-ID
 * @param {Object} articleData - Artikeldaten
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Object>} Erstellter Artikel
 */
async function addTicketArticle(ticketId, articleData, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.post('/api/v1/ticket_articles', {
      ticket_id: ticketId,
      body: articleData.body,
      type: articleData.type || 'note', // Verwende 'note' als Standard
      internal: articleData.internal || false
    });

    return response.data;
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Artikels:', error.response?.data || error.message);
    throw new Error(`Artikel konnte nicht hinzugefügt werden: ${error.message}`);
  }
}

/**
 * Lädt alle verfügbaren Gruppen aus Zammad
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Array>} Array mit Gruppen
 */
async function getGroups(zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const response = await client.get('/api/v1/groups');
    
    // Filtere nur aktive Gruppen und formatiere sie
    const groups = response.data
      .filter(group => group.active !== false)
      .map(group => ({
        id: group.id,
        name: group.name,
        active: group.active
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sortiere alphabetisch
    
    console.log('Geladene Gruppen aus Zammad:', groups.map(g => `${g.name} (ID: ${g.id})`).join(', '));
    
    return groups;
  } catch (error) {
    console.error('Fehler beim Laden der Gruppen:', error.response?.data || error.message);
    throw new Error(`Gruppen konnten nicht geladen werden: ${error.message}`);
  }
}

/**
 * Sucht alle Tickets eines bestimmten Kunden
 * @param {string} customerEmail - E-Mail-Adresse des Kunden
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @param {number} limit - Maximale Anzahl Tickets (Standard: 50)
 * @returns {Promise<Array>} Array mit Tickets
 */
async function getCustomerTickets(customerEmail, zammadUrl, zammadToken, limit = 50) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    
    // Suche zuerst den Kunden
    const customer = await findCustomerByEmail(customerEmail, zammadUrl, zammadToken);
    if (!customer) {
      throw new Error(`Kunde mit E-Mail ${customerEmail} nicht gefunden`);
    }
    
    // Suche Tickets des Kunden
    const response = await client.get('/api/v1/tickets/search', {
      params: {
        query: `customer_id:${customer.id}`,
        limit: limit,
        sort_by: 'created_at',
        order_by: 'desc'
      }
    });
    
    const tickets = response.data || [];
    console.log(`Gefunden: ${tickets.length} Tickets für Kunde ${customerEmail}`);
    
    return tickets;
  } catch (error) {
    console.error('Fehler beim Laden der Kunden-Tickets:', error.response?.data || error.message);
    throw new Error(`Kunden-Tickets konnten nicht geladen werden: ${error.message}`);
  }
}

/**
 * Sucht alle Tickets einer bestimmten Organisation
 * @param {string} organizationName - Name der Organisation
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @param {number} limit - Maximale Anzahl Tickets (Standard: 50)
 * @returns {Promise<Array>} Array mit Tickets
 */
async function getOrganizationTickets(organizationName, zammadUrl, zammadToken, limit = 50) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    
    // Suche zuerst die Organisation
    const organization = await findOrganizationByName(organizationName, zammadUrl, zammadToken);
    if (!organization) {
      throw new Error(`Organisation ${organizationName} nicht gefunden`);
    }
    
    // Suche Tickets der Organisation
    const response = await client.get('/api/v1/tickets/search', {
      params: {
        query: `organization_id:${organization.id}`,
        limit: limit,
        sort_by: 'created_at',
        order_by: 'desc'
      }
    });
    
    const tickets = response.data || [];
    console.log(`Gefunden: ${tickets.length} Tickets für Organisation ${organizationName}`);
    
    return tickets;
  } catch (error) {
    console.error('Fehler beim Laden der Organisations-Tickets:', error.response?.data || error.message);
    throw new Error(`Organisations-Tickets konnten nicht geladen werden: ${error.message}`);
  }
}

/**
 * Lädt detaillierte Ticket-Informationen mit Artikeln
 * @param {Array} tickets - Array mit Ticket-IDs oder Ticket-Objekten
 * @param {string} zammadUrl - Zammad URL
 * @param {string} zammadToken - Zammad Token
 * @returns {Promise<Array>} Array mit detaillierten Tickets
 */
async function getTicketsWithArticles(tickets, zammadUrl, zammadToken) {
  try {
    const client = createZammadClient(zammadUrl, zammadToken);
    const detailedTickets = [];
    
    for (const ticket of tickets.slice(0, 10)) { // Limitiere auf 10 Tickets für Performance
      try {
        const ticketId = typeof ticket === 'object' ? ticket.id : ticket;
        
        // Lade Ticket-Details
        const ticketResponse = await client.get(`/api/v1/tickets/${ticketId}`);
        const ticketData = ticketResponse.data;
        
        // Lade Artikel
        const articlesResponse = await client.get(`/api/v1/ticket_articles/by_ticket/${ticketId}`);
        const articles = articlesResponse.data || [];
        
        detailedTickets.push({
          ...ticketData,
          articles: articles
        });
      } catch (error) {
        console.warn(`Fehler beim Laden von Ticket ${ticket.id || ticket}:`, error.message);
      }
    }
    
    return detailedTickets;
  } catch (error) {
    console.error('Fehler beim Laden der detaillierten Tickets:', error.response?.data || error.message);
    throw new Error(`Detaillierte Tickets konnten nicht geladen werden: ${error.message}`);
  }
}

module.exports = {
  findCustomerByEmail,
  searchCustomers,
  findOrganizationByName,
  findOrCreateOrganization,
  findOrCreateCustomer,
  createTicket,
  getTicket,
  getTicketArticles,
  addTicketArticle,
  getGroups,
  getCustomerTickets,
  getOrganizationTickets,
  getTicketsWithArticles
};
