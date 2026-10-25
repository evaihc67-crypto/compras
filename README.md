# Compras Económicas — guía de instalación

App para el móvil que compara precios de supermercados de Lanzarote y Fuerteventura, con buscador, mejor precio destacado, supermercados activables, alertas de ofertas y cesta ordenada por supermercado.

Todo funciona **gratis** con una cuenta de GitHub:

- **GitHub Pages** aloja la app (te da una dirección web que instalas en el móvil).
- **GitHub Actions** es el "servidor": dos veces al día lee los precios y los guarda en `data/precios.json`.
- **ntfy** (app gratuita) te envía los avisos de ofertas al móvil aunque la app esté cerrada.

---

## 1. Subir el proyecto a GitHub (10 minutos)

1. Crea una cuenta en <https://github.com> si no tienes.
2. Pulsa **New repository**. Nombre: `compras` · marca **Public** · pulsa **Create repository**.
3. Pulsa **uploading an existing file**, descomprime el zip en tu ordenador y arrastra **todo el contenido** de la carpeta (no la carpeta en sí). Pulsa **Commit changes**.
4. Comprueba que existe la carpeta `.github/workflows`. Algunos ordenadores ocultan las carpetas que empiezan por punto y no se suben. Si falta:
   **Add file → Create new file**, escribe como nombre `.github/workflows/actualizar-precios.yml`, pega el contenido de ese archivo y guarda.

## 2. Publicar la app

1. En el repositorio: **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama **main**, carpeta **/ (root)** y pulsa **Save**.
3. En un par de minutos tu app estará en `https://TU-USUARIO.github.io/compras/`

## 3. Activar la actualización automática de precios

1. **Settings → Actions → General → Workflow permissions**: marca **Read and write permissions** y guarda.
2. Ve a la pestaña **Actions**, elige **Actualizar precios** y pulsa **Run workflow** para la primera lectura.
3. Al terminar (unos 10–20 minutos), abre el registro: verás cuántos productos se han leído de cada supermercado.
   A partir de ahí se ejecuta solo, a las 6:17 y a las 14:17.

## 4. Avisos de ofertas en el móvil (ntfy)

1. Instala **ntfy** desde Google Play o App Store.
2. Pulsa **+** y suscríbete a un tema con un nombre difícil de adivinar, por ejemplo `compras-lucia-8k3p2`.
3. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre `NTFY_TOPIC`, valor: el nombre del tema.
4. Edita `config/alertas.txt` con los productos que quieres vigilar (uno por línea). Desde la app puedes copiarlos en **Alertas → Copiar lista para el servidor**.

La app también avisa por su cuenta cuando la abres y hay ofertas nuevas en lo que vigilas (activa **Alertas → Activar notificaciones**).

## 5. Instalar la app en el móvil

- **Android (Chrome):** abre la dirección de la app → menú ⋮ → **Instalar aplicación** / **Añadir a pantalla de inicio**.
- **iPhone (Safari):** abre la dirección → botón Compartir → **Añadir a pantalla de inicio**.

---

## Qué datos tiene cada supermercado

| Supermercado | Cómo se obtiene | Qué precios |
|---|---|---|
| Mercadona | Catálogo completo de su tienda online (almacén de Lanzarote) | Canarias, todos los productos |
| HiperDino | Catálogo completo de su tienda online (tienda c9503 = Lanzarote) | Canarias, todos los productos |
| Aldi | Página de ofertas de la región Canarias | Canarias, solo ofertas de la semana |
| Alcampo | Búsqueda en su tienda online (productos de config/productos.txt) | Precios de su tienda online de península |
| Lidl | Manual | Su web no muestra precios para Canarias |
| Carrefour | Manual | Su web bloquea las lecturas automáticas |
| El Corte Inglés, Hipercor | Manual | Su web no devuelve resultados a lecturas automáticas |
| Chacón, Roper, Cinco Océanos | Manual | No publican precios online |

Si un supermercado falla en una lectura, la app conserva sus últimos precios conocidos y lo marca con ⚠️ en Ajustes.

**Si una web cambia o falla**, no hace falta tocar código: corrige la dirección en `config/tiendas.json`. Si el registro de Actions muestra un error que no entiendes, cópialo y pídeme que lo arregle.

## Archivos de configuración

- `config/ajustes.json` — código postal e isla de HiperDino (Lanzarote: 35500 y c9503; Fuerteventura: 35600 y c9504).
- `config/productos.txt` — productos que se buscan en las webs que no publican catálogo completo.
- `config/alertas.txt` — productos vigilados para los avisos de ntfy.
- `config/tiendas.json` — direcciones de cada web.

## Aviso

Las webs de los supermercados no ofrecen una API pública; este proyecto lee la información que publican para uso personal, con pausas entre peticiones para no sobrecargarlas. Los precios pueden diferir de los de la tienda física: confirma siempre en caja.

GitHub desactiva las tareas programadas de repositorios sin actividad durante 60 días. Si dejan de actualizarse los precios, entra en **Actions** y vuelve a activarla.
