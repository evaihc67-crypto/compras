// Mercadona: catálogo completo desde la API interna de su tienda online (precios según código postal)
import { json, pedir, espera, numero } from '../util.mjs';

const BASE = 'https://tienda.mercadona.es/api';

async function almacen(codigoPostal) {
  try {
    const r = await pedir(`${BASE}/postal-codes/actions/change-pc/`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ new_postal_code: codigoPostal }),
    });
    return r.headers.get('x-customer-wh') || null;
  } catch { return null; }
}

export default async function mercadona({ ajustes, log }) {
  const wh = await almacen(ajustes.codigoPostal);
  log(`almacén para CP ${ajustes.codigoPostal}: ${wh || 'no detectado (precios genéricos)'}`);
  const q = `?lang=es${wh ? '&wh=' + wh : ''}`;
  const arbol = await json(`${BASE}/categories/${q}`);
  const salida = [];
  for (const sup of arbol.results || []) {
    for (const sub of sup.categories || []) {
      try {
        const det = await json(`${BASE}/categories/${sub.id}/${q}`);
        for (const sec of det.categories || []) {
          for (const pr of sec.products || []) {
            const pi = pr.price_instructions || {};
            const p = numero(pi.unit_price);
            if (!p) continue;
            const pa = numero(pi.previous_unit_price);
            const ref = numero(pi.reference_price ?? pi.bulk_price);
            const formato = (pi.reference_format || '').toLowerCase();
            salida.push({
              id: 'mercadona-' + pr.id,
              n: [pr.display_name, pr.packaging, pi.unit_size && pi.size_format ? `${pi.unit_size} ${pi.size_format}` : ''].filter(Boolean).join(' '),
              c: sup.name,
              p,
              pa: pa && pa > p ? pa : undefined,
              o: !!(pi.price_decreased || (pa && pa > p)),
              pk: (formato === 'kg' || formato === 'l') ? ref : undefined,
              pu: ref && formato ? `${ref.toFixed(2).replace('.', ',')} €/${formato === 'l' ? 'L' : formato}` : undefined,
              url: pr.share_url,
            });
          }
        }
      } catch (e) { log(`categoría ${sub.id} falló: ${e.message}`); }
      await espera(250); // ser amables con su servidor
    }
  }
  return salida;
}
