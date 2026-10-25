// Utilidades comunes para los lectores de precios
export const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
export const espera = ms => new Promise(r => setTimeout(r, ms));

export async function pedir(url, opciones = {}, intentos = 2) {
  for (let i = 0; i <= intentos; i++) {
    try {
      const r = await fetch(url, {
        ...opciones,
        headers: { 'user-agent': UA, 'accept-language': 'es-ES,es;q=0.9', ...(opciones.headers || {}) },
        signal: AbortSignal.timeout(25000),
      });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      return r;
    } catch (e) {
      if (i === intentos) throw e;
      await espera(1500 * (i + 1));
    }
  }
}
export const texto = async (url, o) => (await pedir(url, o)).text();
export const json = async (url, o) => {
  const r = await pedir(url, { ...o, headers: { accept: 'application/json', ...(o?.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
};

export function numero(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  // "1.234,56" -> 1234.56 ; "1,99" -> 1.99 ; "1.99" -> 1.99
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
  return isFinite(n) ? n : null;
}

const decodificar = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Productos descritos con datos estructurados schema.org (JSON-LD) */
export function productosJsonLd(html, base) {
  const salida = [];
  const visitar = nodo => {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) return nodo.forEach(visitar);
    const tipo = [].concat(nodo['@type'] || []);
    if (tipo.includes('Product')) {
      const oferta = [].concat(nodo.offers || [])[0] || {};
      const precio = numero(oferta.price ?? oferta.lowPrice ?? oferta.priceSpecification?.price);
      if (nodo.name && precio) salida.push({ n: decodificar(String(nodo.name)), p: precio, url: absoluta(nodo.url || oferta.url, base) });
    }
    for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity']) visitar(nodo[k]);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visitar(JSON.parse(m[1].trim())); } catch { /* bloque roto */ }
  }
  return salida;
}

/** Busca objetos tipo producto dentro de cualquier JSON incrustado en la página */
export function productosJsonIncrustado(html, base) {
  const bloques = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) bloques.push(m[1]);
  for (const m of html.matchAll(/window\.__[A-Z_]+__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/g)) bloques.push(m[1]);
  const salida = [];
  const claveNombre = ['name', 'title', 'displayName', 'display_name', 'productName'];
  const clavePrecio = ['price', 'currentPrice', 'salePrice', 'active_price', 'finalPrice', 'unitPrice', 'amount'];
  const visitar = (o, prof = 0) => {
    if (!o || typeof o !== 'object' || prof > 14) return;
    if (Array.isArray(o)) return o.forEach(x => visitar(x, prof + 1));
    const n = claveNombre.map(k => o[k]).find(v => typeof v === 'string' && v.length > 2 && v.length < 160);
    let p = null;
    for (const k of clavePrecio) {
      const v = o[k];
      p = numero(typeof v === 'object' && v ? (v.amount ?? v.value ?? v.price) : v);
      if (p) break;
    }
    if (n && p && p < 1000) {
      const pa = numero(o.oldPrice ?? o.previousPrice ?? o.list_price ?? o.regularPrice ?? o.originalPrice);
      salida.push({ n, p, pa: pa && pa > p ? pa : undefined, url: absoluta(o.url || o.href || o.link, base) });
    }
    Object.values(o).forEach(v => visitar(v, prof + 1));
  };
  for (const b of bloques) { try { visitar(JSON.parse(b)); } catch { /* no es JSON */ } }
  return salida;
}

export function absoluta(u, base) {
  if (!u || typeof u !== 'string') return undefined;
  try { return new URL(u, base).href; } catch { return undefined; }
}

export function sinDuplicados(lista) {
  const vistos = new Set();
  return lista.filter(x => {
    const k = (x.n + '|' + x.p).toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
}

/** Precio por kg/L a partir del nombre, p. ej. "Leche 6 x 1 L" o "Arroz 500 g" */
export function precioPorUnidad(nombre, precio) {
  const s = String(nombre).toLowerCase().replace(',', '.');
  const m = s.match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|gr|l|litros?|ml|cl)\b/);
  if (!m) return null;
  let cant = parseFloat(m[2]) * (m[1] ? parseInt(m[1]) : 1);
  const u = m[3];
  if (u === 'g' || u === 'gr' || u === 'ml') cant /= 1000;
  if (u === 'cl') cant /= 100;
  if (!cant) return null;
  const esLitro = /^(l|litro|litros|ml|cl)$/.test(u);
  const pk = Math.round((precio / cant) * 100) / 100;
  return { pk, pu: `${pk.toFixed(2).replace('.', ',')} €/${esLitro ? 'L' : 'kg'}` };
}
