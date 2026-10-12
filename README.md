# Cuenta de cobro · JR Multiservicios

Herramienta web para generar cuentas de cobro en PDF con la identidad de **JR Multiservicios**.
Funciona 100 % en el navegador: no necesita servidor ni base de datos, y nada se envía a internet.

## Qué hace
- Formulario de 3 pasos con vista previa del documento en vivo.
- Número asignado por el registro central (`CDC-0001`, `CDC-0002`…): no se repite aunque uses varios celulares.
- Escribe la suma **en letras** y en cifras.
- Calcula el valor de la cuenta para que, después de la retención, te llegue exactamente el neto que quieres recibir.
- Los datos de quien cobra (nombre, cédula, ciudad, banco y cuenta) se escriben una vez y quedan guardados en el dispositivo.
- Descarga el PDF, lo comparte (WhatsApp, correo…) y guarda un historial para reabrir o descargar de nuevo.

## Publicar en GitHub Pages
1. Crea un repositorio nuevo (por ejemplo `JR-Cuenta-Cobro`) y sube estos archivos a la rama `main`.
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. Tu herramienta quedará en `https://TU-USUARIO.github.io/JR-Cuenta-Cobro/`.

Para probarla en tu computador: `python3 -m http.server 8000` dentro de la carpeta y abre `http://localhost:8000`
(no la abras con doble clic: el navegador bloquea el PDF cuando la página viene de `file://`).

## Registro central y dashboard
Cada vez que generas una cuenta de cobro, el sitio avisa al registro de JR (Supabase) con: tipo, número, fecha, nombre del cliente y valor. Con eso el **dashboard** (`JR-Dashboard`) cuenta los documentos. No se envía el PDF, ni la cédula, ni los datos bancarios, ni el concepto.
Si no hay internet, el PDF se genera igual con un número provisional (`CDC-L-XXXXX`) y el aviso se envía solo cuando vuelva la conexión.
La conexión se configura en `config.js` (`supabaseUrl` y `supabaseKey`).

## Personalizar
- `config.js`: teléfono, WhatsApp y textos del encabezado y pie. También puedes dejar prellenados `titular`, `cedula` y datos bancarios.
- `logo.png` (logo horizontal) y `icono.png` (monograma cuadrado, usado en el PDF y como favicon): reemplázalos por tus archivos si cambias la marca (PNG transparente, logo mínimo 800 px de ancho).
- `styles.css`: colores y tipografías (variables al inicio del archivo).

## Archivos
```
index.html   estructura de la página
styles.css   estilos de la página y del documento
app.js       lógica: formulario, cálculo, valor en letras, historial y PDF
config.js    datos de la empresa y conexión al registro central
registro.js  aviso al registro central (con cola si no hay internet)
(raíz)       logo y librerías (jsPDF, html2canvas) incluidas
```

## Notas
- El historial para reabrir cuentas de cobro vive en el navegador de cada dispositivo (si borras los datos del sitio empieza de cero; el conteo del dashboard no se pierde).
- La cédula y los datos bancarios se guardan solo en el navegador de ese dispositivo (`localStorage`); no salen de ahí, pero no uses la herramienta en un equipo compartido sin borrar los datos del sitio.
- Las fuentes (Manrope e Inter) se cargan desde Google Fonts; sin conexión se usa una fuente del sistema.
