// Alcampo: búsqueda en compraonline.alcampo.es. La página trae los productos en window.__INITIAL_STATE__.
// Ojo: son los precios de su tienda online (península), no necesariamente los de Canarias.
import { texto, espera, numero, precioPorUnidad } from '../util.mjs';

export function leerHtmlAlcampo(html) {
  const marca = 'window.__INITIAL_STATE__=';
  const i = html.indexOf(marca);
  if (i < 0) return [];
  const fin = html.indexOf('</script>', i);
  let bruto = html.slice(i + marca.length, fin).trim().replace(/;\s*$/, '');
  let estado;
  try { estado = JSON.parse(bruto); } catch { return []; }
  const entidades = estado?.data?.products?.productEntities || {};
  return Object.values(entidades).map(e => {
    const p = numero(e?.price?.current?.amount);
    const pa = numero(e?.price?.was?.amount ?? e?.price?.previous?.amount);
    const unidad = numero(e?.price?.unit?.current?.amount);
    const etiqueta = String(e?.price?.unit?.label || '');
    const u = /litre/.test(etiqueta) ? 'L' : /kilo|kg/.test(etiqueta) ? 'kg' : null;
    return {
      id: e.retailerProductId || e.productId,
      n: e.name,
      c: e.categoryPath?.[0],
      p,
      pa: pa && pa > p ? pa : undefined,
      o: !!(pa && pa > p) || !!e.offer || (Array.isArray(e.offers) && e.offers.length > 0) || !!(e.promotions && e.promotions.length),
      ...(u && unidad ? { pk: unidad, pu: `${unidad.toFixed(2).replace('.', ',')} €/${u}` } : {}),
    };
  }).filter(x => x.n && x.p);
}

export default async function alcampo({ terminos, log }) {
  const base = 'https://www.compraonline.alcampo.es';
  const vistos = new Map();
  let fallos = 0;
  for (const t of terminos) {
    try {
      const html = await texto(`${base}/search?q=${encodeURIComponent(t.q)}`);
      for (const x of leerHtmlAlcampo(html).slice(0, 25)) {
        if (vistos.has(x.id)) continue;
        vistos.set(x.id, {
          ...x,
          id: 'alcampo-' + x.id,
          c: x.c || t.c,
          url: `${base}/search?q=${encodeURIComponent(x.n)}`,
          ...(x.pk ? {} : (precioPorUnidad(x.n, x.p) || {})),
        });
      }
    } catch (e) {
      if (++fallos <= 3) log(`«${t.q}» → ${e.message}`);
    }
    await espera(700);
  }
  return [...vistos.values()];
}
