// HiperDino: búsqueda en su tienda online. Cada isla tiene su propio código de tienda
// (c9503 = Lanzarote, c9504 = Fuerteventura, c9495 = Gran Canaria) con precios distintos.
import { texto, espera, numero, precioPorUnidad } from '../util.mjs';

const limpiar = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function leerHtmlHiperdino(html, base) {
  const salida = [];
  const trozos = html.split(/<div class="action-container product-container"/).slice(1);
  for (const t of trozos) {
    const id = (t.match(/data-product-id="(\d+)"/) || [])[1];
    const nombre = (t.match(/class="description__text name">([\s\S]*?)<\/div>/) || [])[1];
    const final = (t.match(/price--final[\s\S]*?class="price__text[^"]*">([\s\S]*?)<\/div>/) || [])[1];
    const antes = (t.match(/price--previous[\s\S]*?class="price__text[^"]*">([\s\S]*?)<\/div>/) || [])[1];
    const p = numero(final && limpiar(final));
    if (!id || !nombre || !p) continue;
    const pa = numero(antes && limpiar(antes));
    salida.push({ id, n: limpiar(nombre), p, pa: pa && pa > p ? pa : undefined, porKg: /kg/i.test(final || '') });
  }
  return salida;
}

const NOMBRES = { alimentacion: 'Alimentación', drogueria: 'Droguería', perfumeria: 'Perfumería', limpieza: 'Limpieza' };
const bonito = slug => slug.split('-').map(w => NOMBRES[w] ? NOMBRES[w].toLowerCase() : w).join(' ').replace(/^./, c => c.toUpperCase());

export default async function hiperdino({ ajustes, log }) {
  const tienda = ajustes.hiperdinoTienda || 'c9503';
  const base = `https://www.hiperdino.es/${tienda}`;

  // 1. Secciones del catálogo, sacadas del menú de la web
  const portada = await texto(`${base}/`);
  const patron = new RegExp(`https://www\\.hiperdino\\.es/${tienda}/([a-z0-9-]+)/([a-z0-9-]+)\\.html`, 'g');
  const secciones = new Map();
  for (const m of portada.matchAll(patron)) {
    if (/^(folletos|oferta)/.test(m[1])) continue;
    secciones.set(m[0], bonito(m[1]));
  }
  log(`${secciones.size} secciones en la tienda ${tienda}`);
  if (!secciones.size) throw new Error('no se encontró el menú de secciones');

  // 2. Recorrer cada sección página a página
  const vistos = new Map();
  let fallos = 0;
  for (const [url, categoria] of secciones) {
    const enSeccion = new Set();
    for (let pagina = 1; pagina <= 40; pagina++) {
      let nuevos = 0;
      try {
        const html = await texto(pagina === 1 ? url : `${url}?p=${pagina}`);
        for (const x of leerHtmlHiperdino(html)) {
          if (!enSeccion.has(x.id)) { enSeccion.add(x.id); nuevos++; }
          if (vistos.has(x.id)) continue;
          vistos.set(x.id, {
            id: 'hiperdino-' + x.id,
            n: x.n + (x.porKg ? ' (precio/kg)' : ''),
            c: categoria,
            p: x.p,
            pa: x.pa,
            o: !!x.pa,
            url: `${base}/search/?q=${encodeURIComponent(x.n)}`,
            ...(x.porKg ? { pk: x.p, pu: `${x.p.toFixed(2).replace('.', ',')} €/kg` } : (precioPorUnidad(x.n, x.p) || {})),
          });
        }
      } catch (e) {
        if (++fallos <= 3) log(`${url} p${pagina} → ${e.message}`);
      }
      await espera(400);
      if (!nuevos) break; // última página: ya no aparecen productos nuevos
    }
  }
  if (fallos > 3) log(`…y ${fallos - 3} fallos más`);
  return [...vistos.values()];
}
