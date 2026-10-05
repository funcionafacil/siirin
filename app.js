// ============================================================
// SIRIIN - Kiosco de Identificación Inclusiva
// V1 - Escaneo QR + Consulta Worker + Visualización
// ============================================================

// Configuración
const URL_WORKER = "https://siriin-api.hfhoyos.workers.dev";
const API_KEY = "TU_API_KEY_AQUI"; // ⚠️ Reemplaza esto con tu API_KEY
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

// Estado global
let ultimoCodigoEscaneado = null;
let escaneoActivo = true;

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
  // Evitar procesar el mismo código dos veces seguidas
  if (decodedText === ultimoCodigoEscaneado) {
    return;
  }
  ultimoCodigoEscaneado = decodedText;

  // Resetear el código después de 5 segundos para permitir volver a escanear
  setTimeout(() => { ultimoCodigoEscaneado = null; }, 5000);

  mostrarEstado("Buscando perfil...", "");

  try {
    // 1. Consultar el perfil
    const perfil = await obtenerPerfil(decodedText);

    if (!perfil) {
      mostrarEstado("Código no reconocido", "error");
      return;
    }

    // 2. Mostrar el perfil en pantalla
    mostrarPerfil(perfil);
    mostrarEstado("Perfil encontrado", "exito");

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
  const esFondoClaro = ["#FFDC00", "#FF851B", "#7FDBFF", "#39CCCC"].includes(color);
  contenido.style.color = esFondoClaro ? "#000" : "#fff";

  // Formatear el detalle con subtítulos
  const detalleFormateado = formatearDetalle(perfil.detalle);

  contenido.innerHTML = `
    <h2>${perfil.nombre}</h2>
    <span class="condicion">${perfil.condicion}</span>
    <div class="detalle">${detalleFormateado}</div>
    <img class="foto" src="${perfil.foto}" alt="Foto de ${perfil.nombre}" onerror="this.style.display='none'">
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
    // Buscar el título en cualquier parte del texto y envolverlo en <strong>
    const regex = new RegExp(titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g");
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