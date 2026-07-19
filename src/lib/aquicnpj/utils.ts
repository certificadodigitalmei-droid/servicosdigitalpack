/**
 * Normalizes phone numbers from API string format "['55...']" to array ["55..."]
 */
export function normalizeTelefones(input: string | any[] | null): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  
  try {
    // Remove outer brackets and split by comma, handling potential quotes
    const cleaned = input
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(item => item.replace(/['"]/g, '').trim())
      .filter(item => item && item !== 'null' && item !== 'None');
    
    return cleaned;
  } catch (e) {
    console.error("Error normalizing telefones:", e);
    return [];
  }
}

/**
 * Normalizes boolean strings like "True" or "false" to real boolean
 */
export function normalizeBoolean(val: any): boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

/**
 * Extracts titular name from MEI razao_social like "12.345.678 WESLEY ARCELINO"
 */
export function extractTitularName(razaoSocial: string): string {
  if (!razaoSocial) return "";
  // MEI pattern: CNPJ digits followed by name
  const match = razaoSocial.match(/^[\d.]+\s+(.+)$/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return razaoSocial;
}

/**
 * Formats CNPJ (removes mask)
 */
export function cleanCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}
