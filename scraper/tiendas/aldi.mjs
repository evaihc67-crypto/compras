// Aldi: ofertas de la región Canarias (www.aldi.es/can/...). Aldi no publica su catálogo completo con precios.
import { texto, espera, numero, precioPorUnidad } from '../util.mjs';

export function leerHtmlAldi(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const salida = [];
  const visitar = (o, prof = 0) => {
    if (prof > 30) return;
    if (typeof o === 'string') {
      // parte de los datos viene como texto JSON dentro del JSON
      if (o.length > 200 && /^[[{]/.test(o)) { try { visitar(JSON.parse(o), prof + 1); } catch { /* no es JSON */ } }
      return;
    }
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(x => visitar(x, prof + 1)); return; }
    if (o.currentPrice && o.name) {
      const p = numero(o.currentPrice.priceValue);
      const pa = numero(o.currentPrice.strikePrice?.strikePriceValue);
      if (p) salida.push({
        id: o.objectID,
        n: [o.brandName && !String(o.brandName).includes('ALDI') ? o.brandName.replace(/®/g, '') : '', o.name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
        p,
        pa: pa && pa > p ? pa : undefined,
        slug: o.productSlug,
      });
      return;
    }
    Object.values(o).forEach(v => visitar(v, prof + 1));
  };
  try { visitar(JSON.parse(m[1])); } catch { /* página distinta */ }
  return salida;
}

export default async function aldi({ log }) {
  const base = 'https://www.aldi.es';
  const portada = await texto(`${base}/can/ofertas.html`);
  // además de las ofertas de la semana, cualquier otra página de ofertas de Canarias enlazada
  const extra = [...new Set([...portada.matchAll(/href="(\/can\/ofertas[a-z0-9\-\/]*\.html)"/g)].map(m => m[1]))]
    .filter(u => u !== '/can/ofertas.html').slice(0, 10);
  const vistos = new Map();
  const paginas = [['/can/ofertas.html', portada], ...extra.map(u => [u, null])];
  for (const [ruta, htmlPrevio] of paginas) {
    try {
      const html = htmlPrevio || await texto(base + ruta);
      for (const x of leerHtmlAldi(html)) {
        if (vistos.has(x.id)) continue;
        vistos.set(x.id, {
          id: 'aldi-' + x.id, n: x.n, c: 'Ofertas Aldi', p: x.p, pa: x.pa, o: true,
          url: `${base}/can/ofertas.html`,
          ...(precioPorUnidad(x.n, x.p) || {}),
        });
      }
    } catch (e) { log(`${ruta} → ${e.message}`); }
    await espera(800);
  }
  log(`${paginas.length} páginas de ofertas de Canarias leídas`);
  return [...vistos.values()];
}
