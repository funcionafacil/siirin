// ============================================================
// SIRIIN - Kiosco de Identificación Inclusiva
// V1 - Escaneo QR + Consulta Worker + Visualización
// ============================================================

// Configuración
const URL_WORKER = "https://siriin-api.hfhoyos.workers.dev";
const API_KEY = "Lamasfacil1971$"; // ⚠️ Reemplaza esto con tu API_KEY real
const DISPOSITIVO = "kiosco-entrada"; // Identificador de este dispositivo

// Colores por condición (para el fondo del perfil)
const COLORES_POR_CONDICION = {
  "Persona sorda": "#0074D9",
  "Persona ciega": "#FFDC00",
  "Persona con autismo": "#B10DC9",
  "Sordoceguera": "#2ECC40",
  "Movilidad reducida": "#FF4136",
  "Persona con discapacidad cognitiva": "#FF851B",
  "Persona con discapacidad psicosocial": "#7FDBFF",
  "Persona con trastorno del lenguaje": "#F012BE",
  "Persona con baja visión": "#FF851B",
  "Persona con hipoacusia": "#39CCCC"
};

// Colores de fondo claros (para decidir si el texto va en negro)
const FONDOS_CLAROS = ["#FFDC00", "#FF851B", "#7FDBFF", "#39CCCC", "#2ECC40"];

// Estado global
let ultimoCodigoEscaneado = null;
let tiempoUltimoEscaneo = 0;
const TIEMPO_BLOQUEO = 5000; // 5 segundos para evitar escaneos repetidos

// ============================================================
// Iniciar el escáner QR
// ============================================================
function iniciarEscaner() {
  const scanner = new Html5QrcodeScanner("reader", {
    fps: 10,
    qrbox: { width: 250, height: 250 },
    rememberLastUsedCamera: true,
  });

  scanner.render(onScanSuccess, onScanError);
}

// ============================================================
// Callback: QR leído exitosamente
// ============================================================
async function onScanSuccess(decodedText) {
  const ahora = Date.now();

  // Evitar procesar el mismo código dos veces seguidas
  if (decodedText === ultimoCodigoEscaneado && (ahora - tiempoUltimoEscaneo) < TIEMPO_BLOQUEO) {
    return;
  }

  ultimoCodigoEscaneado = decodedText;
  tiempoUltimoEscaneo = ahora;

  mostrarEstado("Buscando perfil...", "");

  try {
    // 1. Consultar el perfil
    const perfil = await obtenerPerfil(decodedText);

    if (!perfil) {
      mostrarEstado("Código no reconocido: " + decodedText, "error");
      return;
    }

    // 2. Mostrar el perfil en pantalla
    mostrarPerfil(perfil);
    mostrarEstado("Perfil encontrado: " + perfil.nombre, "exito");

    // 3. Registrar el ingreso (en segundo plano)
    registrarIngreso(perfil);

  } catch (error) {
    console.error("Error:", error);
    mostrarEstado("Error al procesar el código", "error");
  }
}

// ============================================================
// Callback: error de escaneo (se llama constantemente, ignorar)
// ============================================================
function onScanError(error) {
  // Silencioso, es normal mientras la cámara busca QR
}

// ============================================================
// Consultar el Worker para obtener el perfil
// ============================================================
async function obtenerPerfil(codigo) {
  const respuesta = await fetch(URL_WORKER + "/api/perfil", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify({ codigo: codigo }),
  });

  const datos = await respuesta.json();

  if (!datos.exito) {
    return null;
  }

  return datos.perfil;
}

// ============================================================
// Registrar el ingreso en el Worker (en segundo plano)
// ============================================================
async function registrarIngreso(perfil) {
  try {
    await fetch(URL_WORKER + "/api/registrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        codigo: perfil.codigo,
        nombre: perfil.nombre,
        condicion: perfil.condicion,
        dispositivo: DISPOSITIVO,
      }),
    });
  } catch (error) {
    console.error("Error al registrar ingreso:", error);
  }
}

// ============================================================
// Mostrar el perfil en pantalla
// ============================================================
function mostrarPerfil(perfil) {
  const seccion = document.getElementById("seccionPerfil");
  const contenido = document.getElementById("perfilContenido");

  // Aplicar color de fondo según condición
  const color = COLORES_POR_CONDICION[perfil.condicion] || "#ffffff";
  contenido.style.backgroundColor = color;

  // Determinar si el texto debe ser claro u oscuro según el fondo
  const esFondoClaro = FONDOS_CLAROS.includes(color);
  contenido.style.color = esFondoClaro ? "#000" : "#fff";

  // Formatear el detalle con subtítulos
  const detalleFormateado = formatearDetalle(perfil.detalle);

  // Construir el HTML con encabezado tipo tarjeta
  contenido.innerHTML = `
    <div class="perfil-encabezado">
      <img
        class="foto-circular"
        src="${perfil.foto}"
        alt="Foto de ${perfil.nombre}"
        onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2245%22 fill=%22%23dddddd%22/><text x=%2250%22 y=%2265%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%23999999%22>?</text></svg>';"
      >
      <div class="datos">
        <h2>${perfil.nombre}</h2>
        <span class="condicion">${perfil.condicion}</span>
      </div>
    </div>

    <div class="detalle">${detalleFormateado}</div>

    <div>
      <button onclick="toggleRuta('${perfil.ruta}')">📍 Ver ruta inclusiva</button>
      <button onclick="ocultarPerfil()">✖ Cerrar</button>
    </div>
    <div id="rutaVisual" style="display:none;"></div>
  `;

  seccion.classList.remove("oculto");
  seccion.scrollIntoView({ behavior: "smooth" });
}

// ============================================================
// Formatear el detalle con subtítulos en mayúsculas
// ============================================================
function formatearDetalle(texto) {
  const subtitulos = [
    "CONDICIÓN:",
    "PREFERENCIAS PERSONALES:",
    "ESTILO DE APRENDIZAJE:",
    "RED DE APOYO:",
    "CONSEJOS PARA ATENCIÓN:",
    "QUÉ EVITAR:",
    "FRASE CLAVE:"
  ];

  let resultado = texto;

  subtitulos.forEach((titulo) => {
    // Escapar caracteres especiales de regex
    const tituloEscapado = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(tituloEscapado, "g");
    resultado = resultado.replace(regex, `<br><strong>${titulo}</strong><br>`);
  });

  return resultado;
}

// ============================================================
// Mostrar u ocultar la ruta inclusiva
// ============================================================
function toggleRuta(ruta) {
  const div = document.getElementById("rutaVisual");
  if (div.style.display === "none") {
    div.innerHTML = `
      <h3>Ruta sugerida</h3>
      <img src="${ruta}" alt="Ruta inclusiva" onerror="this.alt='Imagen de ruta no disponible'">
    `;
    div.style.display = "block";
  } else {
    div.style.display = "none";
  }
}

// ============================================================
// Ocultar el perfil y volver al escáner
// ============================================================
function ocultarPerfil() {
  document.getElementById("seccionPerfil").classList.add("oculto");
  mostrarEstado("Acerca tu código QR a la cámara", "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// Mostrar mensaje de estado
// ============================================================
function mostrarEstado(mensaje, clase) {
  const el = document.getElementById("mensajeEstado");
  el.textContent = mensaje;
  el.className = "estado " + (clase || "");
}

// ============================================================
// Iniciar la app cuando carga la página
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  iniciarEscaner();
});
