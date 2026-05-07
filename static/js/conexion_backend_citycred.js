/*
 * CityCred - Conexión Cerebro Vendedor
 * No reemplaza el simulador existente. Solo se acopla.
 */

(function () {
  "use strict";

  const API_BASE = "http://127.0.0.1:8000";

  function $(id) {
    return document.getElementById(id);
  }

  function getChecked(id) {
    const el = $(id);
    return !!(el && el.checked);
  }

  function getValue(id, fallback) {
    const el = $(id);
    return el ? el.value : fallback;
  }

  function getChatData() {
    const historial = getValue("chatCompleto", "");
    const lineas = historial.split("\n").filter((x) => x.trim());
    const ultimo = lineas.length ? lineas[lineas.length - 1] : "";
    const fuerza = getValue("fuerzaAsistente", getValue("fuerza", "General"));
    return {
      historial,
      mensaje: ultimo,
      ultimo_mensaje: ultimo,
      fuerza,
      tipo: null,
      datos_conocidos: {},
      usar_openai: getChecked("usarOpenAICheck"),
    };
  }

  function paintResult(res) {
    const respuesta = res.respuesta_sugerida || "";
    const guia = res.guia_interna || "";
    const faltantes = Array.isArray(res.datos_faltantes)
      ? res.datos_faltantes.join(", ")
      : "";

    if ($("respuestaSugerida")) $("respuestaSugerida").value = respuesta;
    if ($("respuestaIA")) {
      $("respuestaIA").value =
        `[${(res.intencion_detectada || "general").toUpperCase()} | ${(res.nivel_confianza || 0)}]\n\n` +
        respuesta;
    }
    if ($("guiaFuerza")) {
      $("guiaFuerza").value =
        guia +
        (faltantes
          ? `\n\nDatos faltantes: ${faltantes}\nPróxima acción: ${res.proxima_accion_recomendada || "-"}`
          : "");
      $("guiaFuerza").style.display = "block";
    }

    if ($("cvDatosFaltantes")) {
      $("cvDatosFaltantes").textContent = faltantes || "(ninguno)";
    }
    if ($("cvUltimoCliente")) {
      $("cvUltimoCliente").textContent = getChatData().mensaje || "(vacío)";
    }
  }

  async function callResponse() {
    const payload = getChatData();
    if (!payload.historial && !payload.mensaje) {
      alert("Pegá una conversación primero");
      return;
    }
    const endpoint = getChecked("usarOpenAICheck") ? "/api/chat" : "/api/response";
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    paintResult(data);
  }

  async function setOpenAIKey() {
    const key = getValue("cvOpenAIKey", "").trim() || prompt("Pegá tu API key de OpenAI (no se muestra en HTML):");
    if (!key) return;
    const res = await fetch(`${API_BASE}/api/set-openai-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, temporal: true }),
    });
    const data = await res.json();
    alert(data.ok ? "API key cargada en backend" : `Error: ${data.error || "desconocido"}`);
    await checkOpenAIStatus();
  }

  async function checkOpenAIStatus() {
    const res = await fetch(`${API_BASE}/api/openai-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if ($("cvOpenAIStatus")) {
      $("cvOpenAIStatus").textContent = data.openai_configurado
        ? "OpenAI: configurado"
        : "OpenAI: no configurado";
    }
  }

  async function uploadInfo(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/api/upload-info`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    alert(data.ok ? `OK: ${data.archivo}` : `Error: ${data.error || "desconocido"}`);
  }

  function ensureCerebroSection() {
    if ($("cerebroVendedorBox")) return;

    const section = document.createElement("div");
    section.id = "cerebroVendedorBox";
    section.style.cssText =
      "margin:16px 0;padding:12px;border:1px solid #ccc;border-radius:10px;background:#f8fafc;";
    section.innerHTML = `
      <h3 style="margin:0 0 10px 0;">Cerebro vendedor</h3>
      <div style="font-size:12px;margin-bottom:8px;"><b>Último mensaje cliente:</b> <span id="cvUltimoCliente">(vacío)</span></div>
      <div style="font-size:12px;margin-bottom:8px;"><b>Datos faltantes:</b> <span id="cvDatosFaltantes">(ninguno)</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="cvSugerirBtn" type="button">Sugerir respuesta</button>
        <button id="cvSubirBtn" type="button">Subir nueva información</button>
        <input id="cvOpenAIKey" type="password" placeholder="Pegar API key OpenAI" style="min-width:260px;" />
        <button id="cvSetKeyBtn" type="button">Conectar OpenAI</button>
        <label style="display:flex;align-items:center;gap:6px;">
          <input id="usarOpenAICheck" type="checkbox" />
          Usar OpenAI si está disponible
        </label>
        <span id="cvOpenAIStatus" style="font-size:12px;opacity:.8">OpenAI: ...</span>
      </div>
      <input id="cvUploadInput" type="file" accept=".txt,.docx,.xlsx" style="display:none" />
    `;

    const anchor = document.body;
    anchor.appendChild(section);

    $("cvSugerirBtn").addEventListener("click", callResponse);
    $("cvSetKeyBtn").addEventListener("click", setOpenAIKey);
    $("cvSubirBtn").addEventListener("click", () => $("cvUploadInput").click());
    $("cvUploadInput").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) uploadInfo(f);
    });
  }

  function hookExistingButton() {
    const btn = $("armarRespuestaBtn");
    if (!btn) {
      setTimeout(hookExistingButton, 600);
      return;
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      callResponse();
    });
  }

  async function init() {
    ensureCerebroSection();
    hookExistingButton();
    await checkOpenAIStatus();
    window.CityCredCerebro = {
      sugerir: callResponse,
      statusOpenAI: checkOpenAIStatus,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
