// ============================================================
// SIRIIN V2 - Kiosco con voz contextual
// Escaneo QR + Consulta Worker + Visualización + Voz adaptativa
// ============================================================

// Configuración
const URL_WORKER = "https://siriin-api.hfhoyos.workers.dev";
const API_KEY = "TU_API_KEY_AQUI"; // ⚠️ Reemplaza con tu API_KEY real
const DISPOSITIVO = "kiosco-entrada";

// Colores por condición
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

const FONDOS_CLAROS = ["#FFDC00", "#FF851B", "#7FDBFF", "#39CCCC", "#2ECC40"];

// Estado global
let ultimoCodigoEscaneado = null;
let tiempoUltimoEscaneo = 0;
const TIEMPO_BLOQUEO = 5000;

// Estado de voz
let vozInstancia = null;
let vozActiva = false;
let vocesDisponibles = [];

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
  if (decodedText === ultimoCodigoEscaneado && (ahora - tiempoUltimoEscaneo) < TIEMPO_BLOQUEO) {
    return;
  }

  ultimoCodigoEscaneado = decodedText;
  tiempoUltimoEscaneo = ahora;

  // Detener cualquier voz previa
  detenerVoz();

  mostrarEstado("Buscando perfil...", "");

  try {
    const perfil = await obtenerPerfil(decodedText);

    if (!perfil) {
      mostrarEstado("Código no reconocido: " + decodedText, "error");
      return;
    }

    mostrarPerfil(perfil);
    mostrarEstado("Perfil encontrado: " + perfil.nombre, "exito");

    registrarIngreso(perfil);

    // Activar voz si la condición lo requiere
    manejarVozAutomatica(perfil);

  } catch (error) {
    console.error("Error:", error);
    mostrarEstado("Error al procesar el código", "error");
  }
}

function onScanError(error) {
  // Silencioso
}

// ============================================================
// Consultar el Worker
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
  if (!datos.exito) return null;
  return datos.perfil;
}

// ============================================================
// Registrar ingreso
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
// Mostrar perfil
// ============================================================
function mostrarPerfil(perfil) {
  const seccion = document.getElementById("seccionPerfil");
  const contenido = document.getElementById("perfilContenido");

  const color = COLORES_POR_CONDICION[perfil.condicion] || "#ffffff";
  contenido.style.backgroundColor = color;
  const esFondoClaro = FONDOS_CLAROS.includes(color);
  contenido.style.color = esFondoClaro ? "#000" : "#fff";

  const detalleFormateado = formatearDetalle(perfil.detalle);
  const botonVoz = generarBotonVoz(perfil);

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

    <div id="indicadorVoz" class="indicador-voz" style="display:none;">
      <span class="punto"></span>
      <span>Voz activa</span>
    </div>

    <div>
      ${botonVoz}
      <button onclick="toggleRuta('${perfil.ruta}')">📍 Ver ruta inclusiva</button>
      <button onclick="ocultarPerfil()">✖ Cerrar</button>
    </div>
    <div id="rutaVisual" style="display:none;"></div>
  `;

  seccion.classList.remove("oculto");
  seccion.scrollIntoView({ behavior: "smooth" });
}

// ============================================================
// Generar botón de voz según condición
// ============================================================
function generarBotonVoz(perfil) {
  const tipoVoz = (perfil.voz || "").toLowerCase().trim();
  const tieneTexto = (perfil.textoVoz || "").trim().length > 0;

  // Si no hay texto o la voz está desactivada, no mostrar nada
  if (!tieneTexto || tipoVoz === "desactivada") {
    return "";
  }

  // Si es "opcional", botón discreto
  if (tipoVoz === "opcional") {
    return `<button class="boton-voz discreto" id="btnVoz" onclick="toggleVoz('${escapeTexto(perfil.textoVoz)}')">🔊 Escuchar</button>`;
  }

  // Si es "obligatoria" o "informativa", botón verde normal
  return `<button class="boton-voz" id="btnVoz" onclick="toggleVoz('${escapeTexto(perfil.textoVoz)}')">🔊 Escuchar</button>`;
}

// Escapar texto para meterlo en un onclick (comillas y saltos)
function escapeTexto(texto) {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " ");
}

// ============================================================
// Manejo de voz automática según condición
// ============================================================
function manejarVozAutomatica(perfil) {
  const tipoVoz = (perfil.voz || "").toLowerCase().trim();
  const tieneTexto = (perfil.textoVoz || "").trim().length > 0;

  if (!tieneTexto) return;

  // Solo "obligatoria" arranca automáticamente
  if (tipoVoz === "obligatoria") {
    // Pequeña espera para que el navegador procese el DOM
    setTimeout(() => {
      leerTexto(perfil.textoVoz);
    }, 500);
  }
}

// ============================================================
// Activar / desactivar voz manualmente (botón)
// ============================================================
function toggleVoz(texto) {
  if (vozActiva) {
    detenerVoz();
  } else {
    leerTexto(texto);
  }
}

// ============================================================
// Leer texto en voz alta
// ============================================================
function leerTexto(texto) {
  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no soporta síntesis de voz.");
    return;
  }

  // Cancelar cualquier lectura previa
  window.speechSynthesis.cancel();

  vozInstancia = new SpeechSynthesisUtterance(texto);
  vozInstancia.lang = "es-ES";
  vozInstancia.rate = 0.85;  // Velocidad pausada
  vozInstancia.pitch = 1.0;
  vozInstancia.volume = 1.0;

  // Buscar una voz en español
  if (vocesDisponibles.length === 0) {
    vocesDisponibles = window.speechSynthesis.getVoices();
  }
  const vozEspanol = vocesDisponibles.find(v => v.lang.startsWith("es")) || null;
  if (vozEspanol) vozInstancia.voice = vozEspanol;

  vozInstancia.onstart = () => {
    vozActiva = true;
    actualizarBotonVoz();
    mostrarIndicadorVoz(true);
  };

  vozInstancia.onend = () => {
    vozActiva = false;
    actualizarBotonVoz();
    mostrarIndicadorVoz(false);
  };

  vozInstancia.onerror = (e) => {
    console.error("Error de voz:", e);
    vozActiva = false;
    actualizarBotonVoz();
    mostrarIndicadorVoz(false);
  };

  window.speechSynthesis.speak(vozInstancia);
}

// ============================================================
// Detener la voz
// ============================================================
function detenerVoz() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  vozActiva = false;
  actualizarBotonVoz();
  mostrarIndicadorVoz(false);
}

// ============================================================
// Actualizar apariencia del botón de voz
// ============================================================
function actualizarBotonVoz() {
  const btn = document.getElementById("btnVoz");
  if (!btn) return;

  if (vozActiva) {
    btn.textContent = "⏹ Detener";
    btn.classList.add("activo");
  } else {
    btn.textContent = "🔊 Escuchar";
    btn.classList.remove("activo");
  }
}

// ============================================================
// Mostrar / ocultar indicador de voz activa
// ============================================================
function mostrarIndicadorVoz(visible) {
  const ind = document.getElementById("indicadorVoz");
  if (!ind) return;
  ind.style.display = visible ? "inline-flex" : "none";
}

// ============================================================
// Formatear detalle con subtítulos
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
    const escapado = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapado, "g");
    resultado = resultado.replace(regex, `<br><strong>${titulo}</strong><br>`);
  });

  return resultado;
}

// ============================================================
// Mostrar ruta inclusiva
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
// Ocultar perfil
// ============================================================
function ocultarPerfil() {
  detenerVoz();
  document.getElementById("seccionPerfil").classList.add("oculto");
  mostrarEstado("Acerca tu código QR a la cámara", "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// Mensaje de estado
// ============================================================
function mostrarEstado(mensaje, clase) {
  const el = document.getElementById("mensajeEstado");
  el.textContent = mensaje;
  el.className = "estado " + (clase || "");
}

// ============================================================
// Iniciar app
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  // Cargar voces del sistema
  if ("speechSynthesis" in window) {
    vocesDisponibles = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      vocesDisponibles = window.speechSynthesis.getVoices();
    };
  }

  iniciarEscaner();
});