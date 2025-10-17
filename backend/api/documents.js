/**
 * Dokumentenverarbeitung - PDF, Word, Text-Dateien
 */

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extrahiert Text aus einem PDF-Buffer
 */
async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    };
  } catch (error) {
    console.error('Fehler bei PDF-Extraktion:', error.message);
    throw new Error(`PDF konnte nicht gelesen werden: ${error.message}`);
  }
}

/**
 * Extrahiert Text aus einem Word-Dokument (Buffer)
 */
async function extractWordText(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      messages: result.messages
    };
  } catch (error) {
    console.error('Fehler bei Word-Extraktion:', error.message);
    throw new Error(`Word-Dokument konnte nicht gelesen werden: ${error.message}`);
  }
}

/**
 * Extrahiert Text aus einem Text-Buffer
 */
function extractTextFile(buffer) {
  try {
    return {
      text: buffer.toString('utf-8')
    };
  } catch (error) {
    console.error('Fehler bei Text-Extraktion:', error.message);
    throw new Error(`Text-Datei konnte nicht gelesen werden: ${error.message}`);
  }
}

/**
 * Hauptfunktion: Extrahiert Text basierend auf Dateityp
 */
async function extractDocumentText(file) {
  const { buffer, mimetype, originalname } = file;
  
  console.log(`Extrahiere Text aus: ${originalname} (${mimetype})`);
  
  // PDF
  if (mimetype === 'application/pdf') {
    const result = await extractPdfText(buffer);
    return {
      success: true,
      text: result.text,
      filename: originalname,
      type: 'PDF',
      pages: result.pages,
      metadata: result.info
    };
  }
  
  // Word-Dokumente
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const result = await extractWordText(buffer);
    return {
      success: true,
      text: result.text,
      filename: originalname,
      type: 'Word',
      warnings: result.messages
    };
  }
  
  // Text-Dateien
  if (
    mimetype === 'text/plain' ||
    mimetype === 'text/markdown' ||
    mimetype === 'text/csv'
  ) {
    const result = extractTextFile(buffer);
    return {
      success: true,
      text: result.text,
      filename: originalname,
      type: 'Text'
    };
  }
  
  // Nicht unterstützter Dateityp
  throw new Error(`Dateityp nicht unterstützt: ${mimetype}. Bitte laden Sie PDF, Word oder Text-Dateien hoch.`);
}

module.exports = {
  extractDocumentText,
  extractPdfText,
  extractWordText,
  extractTextFile
};

