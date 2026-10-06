// ============================================================
// SIRIIN V2.6 - Navegación + Escáner + Cards + Voz + Dashboard + Historial
// ============================================================

const URL_WORKER = "https://siriin-api.hfhoyos.workers.dev";
const API_KEY = "Lamasfacil1971$"; // ⚠️ REEMPLAZAR CON API_KEY REAL
const DISPOSITIVO = "kiosco-entrada";
const LS_KEY = "siriin_estadisticas";

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

const CARDS_PERFIL = [
  { campo: "condicion_detalle", icono: "📋", titulo: "Condición", abiertaPorDefecto: true },
  { campo: "preferencias",      icono: "💭", titulo: "Preferencias personales", abiertaPorDefecto: false },
  { campo: "estilo",            icono: "📚", titulo: "Estilo de aprendizaje", abiertaPorDefecto: false },
  { campo: "red_apoyo",         icono: "🤝", titulo: "Red de apoyo", abiertaPorDefecto: false },
  { campo: "consejos",          icono: "💡", titulo: "Consejos para atención", abiertaPorDefecto: false },
  { campo: "evitar",            icono: "⚠️", titulo: "Qué evitar", abiertaPorDefecto: false },
  { campo: "frase_clave",       icono: "💬", titulo: "Frase clave", abiertaPorDefecto: false }
];

let ultimoCodigoEscaneado = null;
let tiempoUltimoEscaneo = 0;
const TIEMPO_BLOQUEO = 5000;
let vozInstancia = null;
let vozActiva = false;
let vocesDisponibles = [];
let scannerActivo = null;
let scannerIniciado = false;
let graficaCondiciones = null;
let graficaDias = null;

// ============================================================
// NAVEGACIÓN
// ============================================================
function inicializarNavegacion() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => cambiarVista(btn.dataset.vista));
  });
}

function cambiarVista(nombreVista) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("activo", b.dataset.vista === nombreVista);
  });
  document.querySelectorAll(".vista").forEach((v) => {
    v.classList.remove("visible");
  });
  const vista = document.getElementById("vista-" + nombreVista);
  if (vista) vista.classList.add("visible");
  detenerVoz();
  if (nombreVista !== "escanear") {
    const perfil = document.getElementById("seccionPerfil");
    if (perfil) perfil.classList.add("oculto");
  }
  if (nombreVista === "dashboard") {
    setTimeout(cargarDashboard, 100);
  }
  if (nombreVista === "historial") {
    setTimeout(cargarHistorial, 100);
  }
}

// ============================================================
// RELOJ
// ============================================================
function actualizarReloj() {
  const el = document.getElementById("navReloj");
  if (!el) return;
  const ahora = new Date();
  el.textContent = String(ahora.getHours()).padStart(2, "0") + ":" +
                   String(ahora.getMinutes()).padStart(2, "0");
}

// ============================================================
// ESCÁNER
// ============================================================
function iniciarEscaner() {
  if (scannerIniciado) return;
  const elemento = document.getElementById("reader");
  if (!elemento) return;

  try {
    scannerActivo = new Html5QrcodeScanner("reader", {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
    });
    scannerActivo.render(onScanSuccess, onScanError);
    scannerIniciado = true;
    console.log("Escáner iniciado");
  } catch (error) {
    console.error("Error al iniciar el escáner:", error);
  }
}

function onScanSuccess(decodedText) {
  const codigoLimpio = limpiarCodigo(decodedText);
  const ahora = Date.now();
  if (codigoLimpio === ultimoCodigoEscaneado && (ahora - tiempoUltimoEscaneo) < TIEMPO_BLOQUEO) return;
  ultimoCodigoEscaneado = codigoLimpio;
  tiempoUltimoEscaneo = ahora;
  detenerVoz();
  mostrarEstado("Código leído: " + codigoLimpio, "");
  procesarPerfil(codigoLimpio);
}

function onScanError() { /* Silencioso */ }

async function procesarPerfil(codigo) {
  try {
    const perfil = await obtenerPerfil(codigo);
    if (!perfil) {
      mostrarEstado("Código no reconocido: " + codigo, "error");
      return;
    }
    mostrarPerfil(perfil);
    mostrarEstado("Perfil encontrado: " + perfil.nombre, "exito");
    registrarIngreso(perfil);
    registrarEstadistica(perfil);
    manejarVozAutomatica(perfil);
  } catch (error) {
    console.error("Error:", error);
    mostrarEstado("Error al procesar el código", "error");
  }
}

// ============================================================
// UTILIDADES
// ============================================================
function limpiarCodigo(texto) {
  if (!texto) return "";
  return texto.toString()
    .replace(/[\r\n\t]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toUpperCase();
}

// ============================================================
// WORKER
// ============================================================
async function obtenerPerfil(codigo) {
  const respuesta = await fetch(URL_WORKER + "/api/perfil", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify({ codigo: limpiarCodigo(codigo) }),
  });
  const datos = await respuesta.json();
  return datos.exito ? datos.perfil : null;
}

async function registrarIngreso(perfil) {
  try {
    await fetch(URL_WORKER + "/api/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
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
// ESTADÍSTICAS (localStorage)
// ============================================================
function cargarEstadisticas() {
  try {
    const datos = localStorage.getItem(LS_KEY);
    if (!datos) return { escaneos: [] };
    return JSON.parse(datos);
  } catch (e) {
    return { escaneos: [] };
  }
}

function guardarEstadisticas(datos) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(datos));
  } catch (e) {
    console.error("Error al guardar estadísticas:", e);
  }
}

function registrarEstadistica(perfil) {
  const datos = cargarEstadisticas();
  const ahora = new Date();
  datos.escaneos.push({
    codigo: perfil.codigo,
    nombre: perfil.nombre,
    condicion: perfil.condicion,
    timestamp: ahora.toISOString(),
    fecha: ahora.toISOString().split("T")[0],
  });
  guardarEstadisticas(datos);
}

function confirmarReset() {
  if (confirm("¿Estás seguro de que quieres reiniciar todas las estadísticas?")) {
    localStorage.removeItem(LS_KEY);
    alert("Estadísticas reiniciadas.");
    cargarDashboard();
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function cargarDashboard() {
  const datos = cargarEstadisticas();
  const escaneos = datos.escaneos || [];

  const total = escaneos.length;
  const hoy = new Date().toISOString().split("T")[0];
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const escaneosHoy = escaneos.filter((e) => e.fecha === hoy).length;
  const escaneosSemana = escaneos.filter((e) => new Date(e.timestamp) >= hace7dias).length;
  const unicos = new Set(escaneos.map((e) => e.codigo)).size;

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt("kpiTotal", total);
  setTxt("kpiHoy", escaneosHoy);
  setTxt("kpiSemana", escaneosSemana);
  setTxt("kpiUnicos", unicos);

  const porCondicion = {};
  escaneos.forEach((e) => {
    porCondicion[e.condicion] = (porCondicion[e.condicion] || 0) + 1;
  });

  const condLabels = Object.keys(porCondicion);
  const condValores = Object.values(porCondicion);
  const condColores = condLabels.map((c) => COLORES_POR_CONDICION[c] || "#cccccc");

  const canvasCond = document.getElementById("graficaCondiciones");
  if (canvasCond) {
    if (graficaCondiciones) graficaCondiciones.destroy();
    graficaCondiciones = new Chart(canvasCond.getContext("2d"), {
      type: "bar",
      data: {
        labels: condLabels,
        datasets: [{
          label: "Escaneos",
          data: condValores,
          backgroundColor: condColores,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  const dias = [];
  const valores = [];
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const fechaISO = fecha.toISOString().split("T")[0];
    const etiqueta = fecha.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
    dias.push(etiqueta);
    valores.push(escaneos.filter((e) => e.fecha === fechaISO).length);
  }

  const canvasDias = document.getElementById("graficaDias");
  if (canvasDias) {
    if (graficaDias) graficaDias.destroy();
    graficaDias = new Chart(canvasDias.getContext("2d"), {
      type: "line",
      data: {
        labels: dias,
        datasets: [{
          label: "Escaneos",
          data: valores,
          borderColor: "#0057b8",
          backgroundColor: "rgba(0, 87, 184, 0.1)",
          tension: 0.3,
          fill: true,
          pointBackgroundColor: "#0057b8",
          pointRadius: 5,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  const conteoPersonas = {};
  escaneos.forEach((e) => {
    if (!conteoPersonas[e.codigo]) {
      conteoPersonas[e.codigo] = { nombre: e.nombre, condicion: e.condicion, count: 0 };
    }
    conteoPersonas[e.codigo].count++;
  });

  const top5 = Object.values(conteoPersonas).sort((a, b) => b.count - a.count).slice(0, 5);
  const tbody = document.getElementById("tablaTop");
  if (tbody) {
    if (top5.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="vacio">Sin datos aún</td></tr>';
    } else {
      const filas = top5.map((p, i) => {
        return '<tr><td>' + (i + 1) + '</td><td>' + p.nombre + '</td><td>' + p.condicion + '</td><td><strong>' + p.count + '</strong></td></tr>';
      });
      tbody.innerHTML = filas.join("");
    }
  }
}

// ============================================================
// HISTORIAL
// ============================================================
async function cargarHistorial() {
  const tbody = document.getElementById("tablaHistorial");
  const info = document.getElementById("historialTotal");

  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="vacio">⏳ Cargando registros...</td></tr>';
  if (info) info.textContent = "Cargando...";

  try {
    const respuesta = await fetch(URL_WORKER + "/api/registros?limite=100", {
      method: "GET",
      headers: { "X-API-Key": API_KEY },
    });

    const datos = await respuesta.json();

    if (!datos.exito) {
      tbody.innerHTML = '<tr><td colspan="6" class="vacio">❌ Error: ' + (datos.error || "desconocido") + '</td></tr>';
      if (info) info.textContent = "Error al cargar";
      return;
    }

    const registros = datos.registros || [];

    if (registros.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="vacio">Sin registros aún</td></tr>';
      if (info) info.textContent = "Total: 0 registros";
      return;
    }

    const filas = registros.map((reg) => {
      const condicion = reg.condicion || "";
      const color = COLORES_POR_CONDICION[condicion] || "#64748b";
      const etiquetaColor = '<span class="etiqueta-condicion" style="background:' + color + ';">' + condicion + '</span>';

      return '<tr>' +
        '<td>' + (reg.fecha || "") + '</td>' +
        '<td>' + (reg.hora || "") + '</td>' +
        '<td><strong>' + (reg.codigo || "") + '</strong></td>' +
        '<td>' + (reg.nombre || "") + '</td>' +
        '<td>' + etiquetaColor + '</td>' +
        '<td>' + (reg.dispositivo || "") + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = filas.join("");

    if (info) {
      info.textContent = "Mostrando " + registros.length + " de " + datos.total + " registros";
    }

  } catch (error) {
    console.error("Error al cargar historial:", error);
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">❌ Error de conexión</td></tr>';
    if (info) info.textContent = "Error de conexión";
  }
}

// ============================================================
// MOSTRAR PERFIL
// ============================================================
function mostrarPerfil(perfil) {
  const seccion = document.getElementById("seccionPerfil");
  const contenido = document.getElementById("perfilContenido");

  const color = COLORES_POR_CONDICION[perfil.condicion] || "#ffffff";
  contenido.style.backgroundColor = color;
  const esFondoClaro = FONDOS_CLAROS.includes(color);
  contenido.style.color = esFondoClaro ? "#000" : "#fff";

  const botonVoz = generarBotonVoz(perfil);
  const cardsHTML = generarCards(perfil);

  const fotoFallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%23dddddd'/><text x='50' y='65' font-size='40' text-anchor='middle' fill='%23999999'>?</text></svg>";

  let html = "";
  html += '<div class="perfil-encabezado">';
  html += '<img class="foto-circular" src="' + perfil.foto + '" alt="Foto de ' + perfil.nombre + '" onerror="this.onerror=null; this.src=\'' + fotoFallback + '\';">';
  html += '<div class="datos">';
  html += '<h2>' + perfil.nombre + '</h2>';
  html += '<span class="condicion">' + perfil.condicion + '</span>';
  html += '</div>';
  html += '</div>';

  html += '<div class="detalle-cards">' + cardsHTML + '</div>';

  html += '<div id="indicadorVoz" class="indicador-voz" style="display:none;">';
  html += '<span class="punto"></span><span>Voz activa</span>';
  html += '</div>';

  html += '<div class="perfil-acciones">';
  html += botonVoz;
  html += '<button onclick="toggleRuta(\'' + perfil.ruta + '\')">📍 Ver ruta inclusiva</button>';
  html += '<button onclick="ocultarPerfil()">✖ Cerrar</button>';
  html += '</div>';
  html += '<div id="rutaVisual" style="display:none;"></div>';

  contenido.innerHTML = html;
  seccion.classList.remove("oculto");
}

function generarCards(perfil) {
  const partes = [];
  CARDS_PERFIL.forEach((card) => {
    const contenido = perfil[card.campo] || "";
    if (!contenido.trim()) return;

    const abierta = card.abiertaPorDefecto;
    const claseCard = abierta ? "card abierta" : "card";
    const estiloContenido = abierta ? "" : 'style="display:none;"';
    const flecha = abierta ? "▼" : "▶";

    let html = "";
    html += '<div class="' + claseCard + '">';
    html += '<button class="card-header" onclick="toggleCard(this)">';
    html += '<span class="card-icono">' + card.icono + '</span>';
    html += '<span class="card-titulo">' + card.titulo + '</span>';
    html += '<span class="card-flecha">' + flecha + '</span>';
    html += '</button>';
    html += '<div class="card-contenido" ' + estiloContenido + '>' + contenido + '</div>';
    html += '</div>';

    partes.push(html);
  });
  return partes.join("");
}

function toggleCard(btn) {
  const contenido = btn.nextElementSibling;
  const flecha = btn.querySelector(".card-flecha");
  const card = btn.parentElement;
  const estaAbierta = contenido.style.display !== "none";

  if (estaAbierta) {
    contenido.style.display = "none";
    flecha.textContent = "▶";
    card.classList.remove("abierta");
  } else {
    contenido.style.display = "block";
    flecha.textContent = "▼";
    card.classList.add("abierta");
  }
}

// ============================================================
// VOZ
// ============================================================
function generarBotonVoz(perfil) {
  const tipoVoz = (perfil.voz || "").toLowerCase().trim();
  const tieneTexto = (perfil.textoVoz || "").trim().length > 0;
  if (!tieneTexto || tipoVoz === "desactivada") return "";

  const textoEscapado = escapeTexto(perfil.textoVoz);
  if (tipoVoz === "opcional") {
    return '<button class="boton-voz discreto" id="btnVoz" onclick="toggleVoz(\'' + textoEscapado + '\')">🔊 Escuchar</button>';
  }
  return '<button class="boton-voz" id="btnVoz" onclick="toggleVoz(\'' + textoEscapado + '\')">🔊 Escuchar</button>';
}

function escapeTexto(texto) {
  return texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, " ");
}

function manejarVozAutomatica(perfil) {
  const tipoVoz = (perfil.voz || "").toLowerCase().trim();
  const tieneTexto = (perfil.textoVoz || "").trim().length > 0;
  if (!tieneTexto) return;
  if (tipoVoz === "obligatoria") {
    setTimeout(() => leerTexto(perfil.textoVoz), 500);
  }
}

function toggleVoz(texto) {
  if (vozActiva) detenerVoz();
  else leerTexto(texto);
}

function leerTexto(texto) {
  if (!("speechSynthesis" in window)) return alert("Tu navegador no soporta síntesis de voz.");
  window.speechSynthesis.cancel();

  vozInstancia = new SpeechSynthesisUtterance(texto);
  vozInstancia.lang = "es-ES";
  vozInstancia.rate = 0.85;
  vozInstancia.pitch = 1.0;
  vozInstancia.volume = 1.0;

  if (vocesDisponibles.length === 0) vocesDisponibles = window.speechSynthesis.getVoices();
  const vozEspanol = vocesDisponibles.find(v => v.lang.startsWith("es"));
  if (vozEspanol) vozInstancia.voice = vozEspanol;

  vozInstancia.onstart = () => { vozActiva = true; actualizarBotonVoz(); mostrarIndicadorVoz(true); };
  vozInstancia.onend = () => { vozActiva = false; actualizarBotonVoz(); mostrarIndicadorVoz(false); };
  vozInstancia.onerror = () => { vozActiva = false; actualizarBotonVoz(); mostrarIndicadorVoz(false); };

  window.speechSynthesis.speak(vozInstancia);
}

function detenerVoz() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  vozActiva = false;
  actualizarBotonVoz();
  mostrarIndicadorVoz(false);
}

function actualizarBotonVoz() {
  const btn = document.getElementById("btnVoz");
  if (!btn) return;
  if (vozActiva) { btn.textContent = "⏹ Detener"; btn.classList.add("activo"); }
  else { btn.textContent = "🔊 Escuchar"; btn.classList.remove("activo"); }
}

function mostrarIndicadorVoz(visible) {
  const ind = document.getElementById("indicadorVoz");
  if (!ind) return;
  ind.style.display = visible ? "inline-flex" : "none";
}

// ============================================================
// RUTA Y CIERRE
// ============================================================
function toggleRuta(ruta) {
  const div = document.getElementById("rutaVisual");
  if (div.style.display === "none") {
    div.innerHTML = '<h3>Ruta sugerida</h3><img src="' + ruta + '" alt="Ruta inclusiva">';
    div.style.display = "block";
  } else {
    div.style.display = "none";
  }
}

function ocultarPerfil() {
  detenerVoz();
  document.getElementById("seccionPerfil").classList.add("oculto");
  mostrarEstado("Acerca tu código QR a la cámara", "");
}

function mostrarEstado(mensaje, clase) {
  const el = document.getElementById("mensajeEstado");
  if (!el) return;
  el.textContent = mensaje;
  el.className = "estado " + (clase || "");
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  console.log("SIRIIN V2.6 inicializando...");

  if ("speechSynthesis" in window) {
    vocesDisponibles = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      vocesDisponibles = window.speechSynthesis.getVoices();
    };
  }

  inicializarNavegacion();
  actualizarReloj();
  setInterval(actualizarReloj, 30000);
  iniciarEscaner();

  console.log("SIRIIN V2.6 listo");
});
