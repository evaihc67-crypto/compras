// Recolector de precios: lo ejecuta GitHub Actions cada día y guarda data/precios.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import mercadona from './tiendas/mercadona.mjs';
import { crearLector } from './tiendas/generico.mjs';

const leerJson = async (ruta, porDefecto) => { try { return JSON.parse(await readFile(ruta, 'utf8')); } catch { return porDefecto; } };
const leerLineas = async ruta => {
  try { return (await readFile(ruta, 'utf8')).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')); }
  catch { return []; }
};
const NOMBRES = { mercadona: 'Mercadona', hiperdino: 'HiperDino', lidl: 'Lidl', aldi: 'Aldi', carrefour: 'Carrefour', alcampo: 'Alcampo', elcorteingles: 'El Corte Inglés', hipercor: 'Hipercor' };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ajustes = await leerJson('config/ajustes.json', { codigoPostal: '35500', zona: 'Canarias' });
const configTiendas = await leerJson('config/tiendas.json', {});
const terminos = (await leerLineas('config/productos.txt')).map(l => {
  const [c, q] = l.includes('|') ? l.split('|').map(s => s.trim()) : [undefined, l];
  return { c, q };
});
const anterior = await leerJson('data/precios.json', { productos: [], fuentes: {} });

const lectores = { mercadona };
for (const [id, cfg] of Object.entries(configTiendas)) if (!id.startsWith('_')) lectores[id] = crearLector(id, cfg);

// Se puede limitar a algunas tiendas: SOLO=mercadona,lidl node scraper/index.mjs
const solo = process.env.SOLO ? process.env.SOLO.split(',') : null;

const productos = [];
const fuentes = {};
for (const [id, lector] of Object.entries(lectores)) {
  const previos = (anterior.demo ? [] : anterior.productos || []).filter(p => p.t === id);
  if (solo && !solo.includes(id)) { productos.push(...previos); fuentes[id] = anterior.fuentes?.[id]; continue; }
  const log = m => console.log(`[${id}] ${m}`);
  const inicio = Date.now();
  try {
    const items = await lector({ ajustes, terminos, log });
    if (!items.length) throw new Error('0 productos (puede que la web haya cambiado; revisa config/tiendas.json)');
    items.forEach(p => { p.t = id; Object.keys(p).forEach(k => p[k] === undefined && delete p[k]); });
    productos.push(...items);
    fuentes[id] = { n: items.length, ok: new Date().toISOString() };
    log(`✓ ${items.length} productos en ${Math.round((Date.now() - inicio) / 1000)} s`);
  } catch (e) {
    // Si falla, se conservan los últimos precios conocidos de esa tienda
    productos.push(...previos);
    fuentes[id] = { n: previos.length, ok: anterior.fuentes?.[id]?.ok, error: e.message };
    log(`✗ ${e.message} — se mantienen ${previos.length} precios anteriores`);
  }
}

const datos = { actualizado: new Date().toISOString(), zona: ajustes.zona, demo: false, fuentes, productos };
await mkdir('data', { recursive: true });
await writeFile('data/precios.json', JSON.stringify(datos));
console.log(`Total: ${productos.length} precios guardados`);

/* ---------- avisos al móvil con ntfy ---------- */
const tema = process.env.NTFY_TOPIC;
const alertas = await leerLineas('config/alertas.txt');
if (tema && alertas.length) {
  const avisados = await leerJson('data/avisados.json', {});
  const nuevas = [];
  for (const termino of alertas) {
    const palabras = norm(termino).split(/\s+/);
    for (const p of productos) {
      if (!p.o || !palabras.every(w => norm(p.n).includes(w))) continue;
      const clave = `${p.id}@${p.p}`;
      if (avisados[clave]) continue;
      avisados[clave] = Date.now();
      nuevas.push(p);
    }
  }
  const hace30 = Date.now() - 30 * 864e5;
  for (const k in avisados) if (avisados[k] < hace30) delete avisados[k];
  await writeFile('data/avisados.json', JSON.stringify(avisados));

  if (nuevas.length) {
    nuevas.sort((a, b) => a.p - b.p);
    const lineas = nuevas.slice(0, 15).map(p => `• ${p.n}: ${p.p.toFixed(2).replace('.', ',')} € en ${NOMBRES[p.t] || p.t}${p.pa ? ` (antes ${p.pa.toFixed(2).replace('.', ',')} €)` : ''}`);
    if (nuevas.length > 15) lineas.push(`…y ${nuevas.length - 15} más`);
    const r = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topic: tema,
        title: `🛒 ${nuevas.length} oferta${nuevas.length > 1 ? 's' : ''} en lo que vigilas`,
        message: lineas.join('\n'),
        tags: ['shopping_cart'],
        click: process.env.APP_URL || undefined,
      }),
    });
    console.log(`Aviso ntfy enviado (${nuevas.length} ofertas): HTTP ${r.status}`);
  } else console.log('Sin ofertas nuevas para tus alertas');
}
