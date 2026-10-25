// Lector genérico: abre páginas de búsqueda u ofertas de una web y extrae los productos
// que la propia web publica en sus datos estructurados. Se configura en config/tiendas.json.
import { texto, json, espera, productosJsonLd, productosJsonIncrustado, sinDuplicados, precioPorUnidad, numero, absoluta } from '../util.mjs';

/** Algunas webs tienen una API de búsqueda en JSON; si está configurada se usa primero */
function leerApi(datos, cfg) {
  const ruta = (cfg.api.lista || '').split('.').filter(Boolean);
  let lista = datos;
  for (const k of ruta) lista = lista?.[k];
  if (!Array.isArray(lista)) return [];
  const f = cfg.api.campos || {};
  return lista.map(x => {
    const p = numero(x[f.precio]);
    const pa = numero(x[f.precioAnterior]);
    return { n: x[f.nombre], p, pa: pa && pa > p ? pa : undefined, url: absoluta(x[f.url], cfg.base) };
  }).filter(x => x.n && x.p);
}

export function crearLector(id, cfg) {
  return async function lector({ terminos, log }) {
    const encontrados = [];
    const paginas = [];
    if (cfg.ofertas) paginas.push(...cfg.ofertas.map(u => ({ url: u, oferta: true })));
    if (cfg.busqueda) paginas.push(...terminos.map(t => ({ url: cfg.busqueda.replace('{q}', encodeURIComponent(t.q)), termino: t.q, categoria: t.c })));

    let fallos = 0;
    for (const pg of paginas) {
      try {
        let items = [];
        if (cfg.api && pg.termino) {
          const url = cfg.api.url.replace('{q}', encodeURIComponent(pg.termino));
          try { items = leerApi(await json(url), cfg); } catch { /* se prueba con la página web */ }
        }
        if (!items.length) {
          const html = await texto(pg.url);
          items = productosJsonLd(html, pg.url);
          if (!items.length) items = productosJsonIncrustado(html, pg.url);
        }
        if (pg.termino) items = items.slice(0, cfg.maxPorBusqueda || 15);
        items.forEach(x => { if (pg.oferta) x.o = true; if (x.pa) x.o = true; if (pg.categoria && !x.c) x.c = pg.categoria; if (pg.oferta && !x.c) x.c = 'Folleto / ofertas'; });
        encontrados.push(...items);
      } catch (e) {
        fallos++;
        if (fallos <= 3) log(`${pg.url} → ${e.message}`);
      }
      await espera(cfg.pausaMs ?? 700);
    }
    if (fallos > 3) log(`…y ${fallos - 3} fallos más`);

    return sinDuplicados(encontrados).map((x, i) => ({
      id: `${id}-${hash(x.n)}`,
      n: x.n.trim(),
      c: x.c,
      p: Math.round(x.p * 100) / 100,
      pa: x.pa,
      o: !!x.o,
      url: x.url,
      ...(precioPorUnidad(x.n, x.p) || {}),
    }));
  };
}

function hash(s) {
  let h = 0;
  for (const c of String(s).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
