/**
 * Kleiner CSV-Parser ohne Abhängigkeiten (RFC-4180-nah).
 * Unterstützt: Felder in Anführungszeichen, Kommas und Zeilenumbrüche darin,
 * doppelte Anführungszeichen ("") als Escape, \r\n und \n, leere Zeilen.
 */

/**
 * Zerlegt CSV-Text in Zeilen mit Feldern.
 * @param {string} text CSV-Inhalt
 * @returns {string[][]} Zeilen (leere Zeilen werden übersprungen)
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Schließt das aktuelle Feld ab.
  const endField = () => {
    row.push(field);
    field = '';
  };
  // Schließt die aktuelle Zeile ab; komplett leere Zeilen werden verworfen.
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    row = [];
  };

  // BOM am Dateianfang entfernen.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // escaptes Anführungszeichen
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c === '\r') {
      // \r\n: das \n erledigt den Zeilenwechsel; einzelnes \r ebenfalls als Zeilenende
      if (src[i + 1] !== '\n') endRow();
    } else {
      field += c;
    }
  }
  // Letzte Zeile ohne abschließenden Zeilenumbruch.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Parst CSV mit Kopfzeile in Objekte {spaltenname: wert}.
 * @param {string} text CSV-Inhalt
 * @returns {Record<string,string>[]}
 */
export function parseCsvObjects(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), cells[i] ?? ''])));
}
