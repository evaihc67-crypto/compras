/* Compras Económicas — comparador de precios de supermercados en Canarias */
'use strict';

const TIENDAS = [
  { id: 'mercadona',    nombre: 'Mercadona',      color: '#1f8a4c', fuente: 'Catálogo de Lanzarote (automático)' },
  { id: 'hiperdino',    nombre: 'HiperDino',      color: '#e4572e', fuente: 'Catálogo de Lanzarote (automático)' },
  { id: 'lidl',         nombre: 'Lidl',           color: '#1d5fbf', fuente: 'Manual (su web no da precios de Canarias)' },
  { id: 'aldi',         nombre: 'Aldi',           color: '#2a3a8c', fuente: 'Ofertas de Canarias (automático)' },
  { id: 'carrefour',    nombre: 'Carrefour',      color: '#3b7dd8', fuente: 'Manual (su web bloquea la lectura)' },
  { id: 'alcampo',      nombre: 'Alcampo',        color: '#c8102e', fuente: 'Tienda online, precios de península (automático)' },
  { id: 'elcorteingles', nombre: 'El Corte Inglés', color: '#2e7d32', fuente: 'Manual' },
  { id: 'hipercor',     nombre: 'Hipercor',       color: '#d97706', fuente: 'Manual' },
  { id: 'chacon',       nombre: 'Chacón',         color: '#8a5a2b', fuente: 'Manual' },
  { id: 'roper',        nombre: 'Roper',          color: '#7b3fa0', fuente: 'Manual' },
  { id: 'cincooceanos', nombre: 'Cinco Océanos',  color: '#0e8fa3', fuente: 'Manual' },
];
const TIENDA = Object.fromEntries(TIENDAS.map(t => [t.id, t]));
const ORDEN_TIENDA = Object.fromEntries(TIENDAS.map((t, i) => [t.id, i]));

/* ---------- almacenamiento local seguro ---------- */
const guardado = {
  leer(clave, porDefecto) {
    try { const v = localStorage.getItem('ce:' + clave); return v ? JSON.parse(v) : porDefecto; }
    catch { return porDefecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('ce:' + clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
  },
};

const estado = {
  datos: null,                                   // precios.json
  activas: { ...Object.fromEntries(TIENDAS.map(t => [t.id, true])), ...guardado.leer('activas', {}) },
  cesta: guardado.leer('cesta', {}),             // id -> {item, cant, hecho}
  alertas: guardado.leer('alertas', []),         // ['aceite de oliva', ...]
  avisados: guardado.leer('avisados', {}),       // id+precio -> fecha
  manual: guardado.leer('manual', []),           // precios añadidos a mano
  fuente: guardado.leer('fuente', 'data/precios.json'),
  orden: guardado.leer('orden', 'precio'),       // 'precio' | 'unidad'
  categoria: null,
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = n => (n == null || isNaN(n)) ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').trim();

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('ver');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('ver'), 2400);
}

function todosLosProductos() {
  const auto = estado.datos?.productos || [];
  const manual = estado.manual.map(m => ({ ...m, manual: true }));
  return auto.concat(manual);
}
const visibles = () => todosLosProductos().filter(p => estado.activas[p.t] && typeof p.p === 'number');

function coincide(p, consulta) {
  const nombre = p._n || (p._n = norm(p.n + ' ' + (p.c || '')));
  return norm(consulta).split(/\s+/).filter(Boolean).every(pal => nombre.includes(pal));
}

function ordenar(lista) {
  const clave = estado.orden === 'unidad' ? (p => p.pk ?? p.p * 1000) : (p => p.p);
  return lista.slice().sort((a, b) => clave(a) - clave(b));
}

/* ---------- carga de datos ---------- */
async function cargarDatos(manualmente = false) {
  const btn = $('#btn-refrescar'); btn.classList.add('girando');
  try {
    const url = estado.fuente + (estado.fuente.includes('?') ? '&' : '?') + 't=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    estado.datos = await r.json();
    guardado.escribir('copia', estado.datos);
    if (manualmente) toast('Precios actualizados');
  } catch (e) {
    estado.datos = estado.datos || guardado.leer('copia', null);
    toast(estado.datos ? 'Sin conexión: usando la última copia' : 'No se pudieron cargar los precios');
  } finally {
    btn.classList.remove('girando');
  }
  pintarEstado(); pintarCategorias(); buscar(); comprobarAlertas(); pintarAlertas(); pintarCesta();
}

function pintarEstado() {
  const d = estado.datos;
  if (!d) { $('#estado-datos').textContent = 'Sin datos todavía'; return; }
  const f = d.actualizado ? new Date(d.actualizado) : null;
  const cuando = f ? f.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '¿?';
  $('#estado-datos').textContent = `${d.demo ? 'DATOS DE EJEMPLO · ' : ''}${d.zona || 'Canarias'} · ${cuando}`;
}

/* ---------- buscar ---------- */
function pintarCategorias() {
  const cats = [...new Set(visibles().map(p => p.c).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#chips-categorias').innerHTML =
    `<button class="chip ${!estado.categoria ? 'activa' : ''}" data-cat="">Ofertas</button>` +
    cats.map(c => `<button class="chip ${estado.categoria === c ? 'activa' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}

function filaProducto(p, opciones = {}) {
  const t = TIENDA[p.t];
  const enCesta = !!estado.cesta[p.id];
  const ahorro = (p.pa && p.pa > p.p) ? `<s>${euros(p.pa)}</s>` : '';
  const meta = [p.u, p.pu, p.manual ? 'añadido a mano' : ''].filter(Boolean).map(esc).join(' · ');
  return `<div class="fila">
    <div class="info">
      <div class="tienda"><i class="punto" style="background:${t?.color || '#888'}"></i>${esc(t?.nombre || p.t)}${p.o ? '<span class="oferta">OFERTA</span>' : ''}</div>
      ${opciones.sinNombre ? '' : `<div class="nombre">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:inherit">${esc(p.n)}</a>` : esc(p.n)}</div>`}
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>
    <div class="precio">${euros(p.p)}${ahorro}</div>
    <button class="add ${enCesta ? 'en-cesta' : ''}" data-add="${esc(p.id)}" aria-label="${enCesta ? 'Quitar de' : 'Añadir a'} la cesta">${enCesta ? '✓' : '+'}</button>
  </div>`;
}

function buscar() {
  const q = $('#q').value.trim();
  const cont = $('#resultados');
  if (!estado.datos && !estado.manual.length) { cont.innerHTML = '<div class="vacio"><b>⏳</b>Cargando precios…</div>'; return; }

  let lista = visibles();
  let titulo = '';
  if (q) lista = lista.filter(p => coincide(p, q));
  else if (estado.categoria) { lista = lista.filter(p => p.c === estado.categoria); titulo = estado.categoria; }
  else { lista = lista.filter(p => p.o); titulo = 'Ofertas en tus supermercados'; }

  lista = ordenar(lista);
  const activas = TIENDAS.filter(t => estado.activas[t.id]).length;
  const avisoDemo = estado.datos?.demo ? '<div class="aviso">Estos son <b>datos de ejemplo</b>. Los precios reales aparecerán cuando el servidor gratuito haga su primera actualización (ver guía).</div>' : '';

  if (!lista.length) {
    cont.innerHTML = avisoDemo + `<div class="vacio"><b>🤷</b>${q ? `No hay resultados para «${esc(q)}» en tus ${activas} supermercados activos.` : 'Nada que mostrar aquí todavía.'}</div>`;
    return;
  }

  const limite = 150;
  const mejor = lista[0];
  const resto = lista.slice(1, limite);
  const porTienda = {};
  lista.forEach(p => { if (!porTienda[p.t]) porTienda[p.t] = p; });
  const resumen = Object.values(porTienda).sort((a, b) => a.p - b.p);

  cont.innerHTML = avisoDemo + `
    <div class="cabecera-vista">
      <h2>${q ? `${lista.length} resultado${lista.length > 1 ? 's' : ''}` : esc(titulo)}</h2>
      <button class="btn-mini" id="btn-orden">${estado.orden === 'unidad' ? 'Orden: €/kg·L' : 'Orden: precio'}</button>
    </div>
    <div class="tarjeta mejor">
      <span class="etiqueta-mejor">MEJOR PRECIO</span>
      ${filaProducto(mejor)}
    </div>
    ${q && resumen.length > 1 ? `<div class="tarjeta"><h3>Lo más barato en cada súper</h3>${resumen.map(p => filaProducto(p)).join('')}</div>` : ''}
    ${resto.length ? `<div class="tarjeta"><h3>Todos los demás</h3>${resto.map(p => filaProducto(p)).join('')}</div>` : ''}
    ${lista.length > limite ? `<p class="ayuda">Mostrando ${limite} de ${lista.length}. Afina la búsqueda para ver más.</p>` : ''}`;
}

/* ---------- cesta ---------- */
function alternarCesta(id) {
  if (estado.cesta[id]) { delete estado.cesta[id]; toast('Quitado de la cesta'); }
  else {
    const item = todosLosProductos().find(p => p.id === id);
    if (!item) return;
    estado.cesta[id] = { item, cant: 1, hecho: false };
    toast(`Añadido: ${item.n}`);
  }
  guardado.escribir('cesta', estado.cesta);
  buscar(); pintarCesta(); pintarComprobacionAlertas();
}

function pintarCesta() {
  const entradas = Object.entries(estado.cesta);
  const n = entradas.reduce((s, [, e]) => s + e.cant, 0);
  const badge = $('#contador-cesta'); badge.hidden = !n; badge.textContent = n;
  const cont = $('#cesta');
  if (!entradas.length) { cont.innerHTML = '<div class="vacio"><b>🧺</b>Tu cesta está vacía.<br>Pulsa «+» en un producto para añadirlo.</div>'; return; }

  // precio actual (si se ha actualizado desde que se añadió)
  const actuales = Object.fromEntries(todosLosProductos().map(p => [p.id, p]));
  const grupos = {};
  for (const [id, e] of entradas) {
    const item = actuales[id] || e.item;
    (grupos[item.t] = grupos[item.t] || []).push({ id, ...e, item });
  }
  let total = 0;
  const html = Object.keys(grupos).sort((a, b) => ORDEN_TIENDA[a] - ORDEN_TIENDA[b]).map(tid => {
    const t = TIENDA[tid];
    const items = grupos[tid].sort((a, b) => a.hecho - b.hecho || a.item.n.localeCompare(b.item.n, 'es'));
    const sub = items.reduce((s, e) => s + e.item.p * e.cant, 0);
    total += sub;
    return `<div class="tarjeta grupo-cesta">
      <h3><span class="tienda"><i class="punto" style="background:${t?.color}"></i>${esc(t?.nombre || tid)}</span><span>${euros(sub)}</span></h3>
      ${items.map(e => `<div class="fila" style="${e.hecho ? 'opacity:.5' : ''}">
        <input type="checkbox" data-hecho="${esc(e.id)}" ${e.hecho ? 'checked' : ''} aria-label="Marcar como comprado" style="width:22px;height:22px">
        <div class="info"><div class="nombre" style="${e.hecho ? 'text-decoration:line-through' : ''}">${esc(e.item.n)}</div>
          <div class="meta">${euros(e.item.p)} / ud${e.item.o ? ' · en oferta' : ''}${!estado.activas[tid] ? ' · súper desactivado' : ''}</div></div>
        <div class="cantidad"><button data-menos="${esc(e.id)}">−</button><b>${e.cant}</b><button data-mas="${esc(e.id)}">+</button></div>
      </div>`).join('')}
    </div>`;
  }).join('');
  cont.innerHTML = html + `<div class="total"><span>Total (${Object.keys(grupos).length} supermercado${Object.keys(grupos).length > 1 ? 's' : ''})</span><span>${euros(total)}</span></div>`;
}

function cambiarCantidad(id, delta) {
  const e = estado.cesta[id]; if (!e) return;
  e.cant += delta;
  if (e.cant <= 0) delete estado.cesta[id];
  guardado.escribir('cesta', estado.cesta); pintarCesta(); buscar();
}

/* ---------- alertas ---------- */
function ofertasDeAlertas() {
  const ofertas = visibles().filter(p => p.o);
  return estado.alertas.map(termino => ({ termino, items: ordenar(ofertas.filter(p => coincide(p, termino))) }));
}

function pintarAlertas() {
  $('#lista-alertas').innerHTML = estado.alertas.length
    ? estado.alertas.map((a, i) => `<div class="alerta-item"><span>🔔 ${esc(a)}</span><button class="btn-texto" data-borrar-alerta="${i}">Quitar</button></div>`).join('')
    : '<p class="ayuda">Aún no vigilas ningún producto.</p>';
  pintarComprobacionAlertas();
}

function pintarComprobacionAlertas() {
  const res = ofertasDeAlertas().filter(r => r.items.length);
  const n = res.reduce((s, r) => s + r.items.length, 0);
  const badge = $('#contador-alertas'); badge.hidden = !n; badge.textContent = n;
  $('#ofertas-alertas').innerHTML = res.map(r => `<div class="tarjeta"><h3>Ofertas de «${esc(r.termino)}»</h3>${r.items.slice(0, 20).map(p => filaProducto(p)).join('')}</div>`).join('');
}

async function comprobarAlertas() {
  if (!estado.alertas.length) return;
  const nuevas = [];
  for (const r of ofertasDeAlertas()) {
    for (const p of r.items) {
      const clave = p.id + '@' + p.p;
      if (!estado.avisados[clave]) { estado.avisados[clave] = Date.now(); nuevas.push({ termino: r.termino, p }); }
    }
  }
  // limpiar avisos de más de 30 días
  const limite = Date.now() - 30 * 864e5;
  for (const k in estado.avisados) if (estado.avisados[k] < limite) delete estado.avisados[k];
  guardado.escribir('avisados', estado.avisados);
  if (!nuevas.length || estado.datos?.demo) return;

  const cuerpo = nuevas.slice(0, 5).map(x => `${x.p.n} — ${euros(x.p.p)} en ${TIENDA[x.p.t]?.nombre}`).join('\n')
    + (nuevas.length > 5 ? `\n…y ${nuevas.length - 5} más` : '');
  toast(`🔔 ${nuevas.length} oferta${nuevas.length > 1 ? 's' : ''} nueva${nuevas.length > 1 ? 's' : ''} en lo que vigilas`);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      const titulo = `${nuevas.length} oferta${nuevas.length > 1 ? 's' : ''} en lo que vigilas`;
      if (reg) reg.showNotification(titulo, { body: cuerpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ofertas' });
      else new Notification(titulo, { body: cuerpo });
    }
  } catch { /* notificaciones no disponibles */ }
}

/* ---------- ajustes ---------- */
function pintarTiendas() {
  const cuenta = {};
  todosLosProductos().forEach(p => { cuenta[p.t] = (cuenta[p.t] || 0) + 1; });
  const fuentes = estado.datos?.fuentes || {};
  $('#lista-tiendas').innerHTML = TIENDAS.map(t => {
    const f = fuentes[t.id];
    const est = f?.error ? ' · ⚠️ última lectura falló' : '';
    return `<label class="tienda-toggle">
      <span><span class="tienda"><i class="punto" style="background:${t.color}"></i>${esc(t.nombre)}</span>
      <small>${esc(t.fuente)} · ${cuenta[t.id] || 0} precios${est}</small></span>
      <span class="switch"><input type="checkbox" data-tienda="${t.id}" ${estado.activas[t.id] ? 'checked' : ''}><span></span></span>
    </label>`;
  }).join('');
  $('#m-tienda').innerHTML = TIENDAS.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
  $('#lista-manual').innerHTML = estado.manual.length
    ? `<div class="tarjeta"><h3>Tus precios a mano</h3>${estado.manual.map((m, i) => `<div class="fila"><div class="info">
        <div class="tienda"><i class="punto" style="background:${TIENDA[m.t]?.color}"></i>${esc(TIENDA[m.t]?.nombre)}</div>
        <div class="nombre">${esc(m.n)}</div><div class="meta">${new Date(m.fecha).toLocaleDateString('es-ES')}${m.o ? ' · oferta' : ''}</div></div>
        <div class="precio">${euros(m.p)}</div><button class="btn-texto" data-borrar-manual="${i}">✕</button></div>`).join('')}</div>`
    : '';
  $('#fuente').value = estado.fuente;
}

/* ---------- eventos ---------- */
function cambiarVista(v) {
  document.querySelectorAll('.vista').forEach(s => s.classList.toggle('activa', s.id === 'vista-' + v));
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('activa', b.dataset.vista === v));
  if (v === 'ajustes') pintarTiendas();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const b = e.target.closest('button, input[type=checkbox]');
  if (!b) return;
  if (b.dataset.vista) return cambiarVista(b.dataset.vista);
  if (b.dataset.add) return alternarCesta(b.dataset.add);
  if (b.dataset.mas) return cambiarCantidad(b.dataset.mas, 1);
  if (b.dataset.menos) return cambiarCantidad(b.dataset.menos, -1);
  if (b.dataset.hecho) { estado.cesta[b.dataset.hecho].hecho = b.checked; guardado.escribir('cesta', estado.cesta); return pintarCesta(); }
  if (b.dataset.cat !== undefined) { estado.categoria = b.dataset.cat || null; $('#q').value = ''; pintarCategorias(); return buscar(); }
  if (b.dataset.borrarAlerta !== undefined) { estado.alertas.splice(+b.dataset.borrarAlerta, 1); guardado.escribir('alertas', estado.alertas); return pintarAlertas(); }
  if (b.dataset.borrarManual !== undefined) { estado.manual.splice(+b.dataset.borrarManual, 1); guardado.escribir('manual', estado.manual); pintarTiendas(); return buscar(); }
  if (b.id === 'btn-orden') { estado.orden = estado.orden === 'precio' ? 'unidad' : 'precio'; guardado.escribir('orden', estado.orden); return buscar(); }
});

document.addEventListener('change', e => {
  const t = e.target.dataset?.tienda;
  if (!t) return;
  estado.activas[t] = e.target.checked;
  guardado.escribir('activas', estado.activas);
  toast(`${TIENDA[t].nombre} ${e.target.checked ? 'activado' : 'desactivado'}`);
  pintarCategorias(); buscar(); pintarComprobacionAlertas(); pintarCesta();
});

let temporizador;
$('#q').addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(() => { estado.categoria = null; pintarCategorias(); buscar(); }, 180); });
$('#btn-refrescar').addEventListener('click', () => cargarDatos(true));
$('#btn-vaciar').addEventListener('click', () => {
  if (!Object.keys(estado.cesta).length || !confirm('¿Vaciar la cesta?')) return;
  estado.cesta = {}; guardado.escribir('cesta', estado.cesta); pintarCesta(); buscar();
});

$('#form-alerta').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#nueva-alerta').value.trim();
  if (v && !estado.alertas.some(a => norm(a) === norm(v))) { estado.alertas.push(v); guardado.escribir('alertas', estado.alertas); }
  $('#nueva-alerta').value = ''; pintarAlertas(); comprobarAlertas();
});

$('#btn-permiso').addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('Este navegador no admite notificaciones');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Notificaciones activadas' : 'Permiso denegado');
});

$('#btn-copiar-alertas').addEventListener('click', async () => {
  const texto = estado.alertas.join('\n');
  if (!texto) return toast('Añade primero algún producto a vigilar');
  try { await navigator.clipboard.writeText(texto); toast('Copiado. Pégalo en config/alertas.txt'); }
  catch { prompt('Copia este texto en config/alertas.txt:', texto); }
});

$('#form-manual').addEventListener('submit', e => {
  e.preventDefault();
  const item = {
    id: 'm-' + Date.now().toString(36), t: $('#m-tienda').value, n: $('#m-nombre').value.trim(),
    p: parseFloat($('#m-precio').value), o: $('#m-oferta').checked, fecha: Date.now(), c: 'Añadidos a mano',
  };
  if (!item.n || isNaN(item.p)) return;
  estado.manual.unshift(item); guardado.escribir('manual', estado.manual);
  e.target.reset(); toast('Precio guardado'); pintarTiendas(); pintarCategorias(); buscar();
});

$('#form-fuente').addEventListener('submit', e => {
  e.preventDefault();
  estado.fuente = $('#fuente').value.trim() || 'data/precios.json';
  guardado.escribir('fuente', estado.fuente); cargarDatos(true);
});

/* ---------- arranque ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
pintarCesta(); pintarAlertas();
cargarDatos();
setInterval(() => { if (document.visibilityState === 'visible') cargarDatos(); }, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.datos?.actualizado && Date.now() - new Date(estado.datos.actualizado) > 3 * 3600e3) cargarDatos();
});
