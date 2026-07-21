export const ADMIN_CSS = String.raw`
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg: #f4f6fb;
  --panel: #ffffff;
  --border: #dfe4ee;
  --muted: #667085;
  --text: #172033;
  --brand: #5b36c9;
  --brand-dark: #40209d;
  --inbound: #ffffff;
  --outbound: #e9e2ff;
  --danger: #b42318;
  --success: #18794e;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login-card { width: min(420px, 100%); background: var(--panel); border: 1px solid var(--border); border-radius: 20px; padding: 30px; box-shadow: 0 18px 50px rgba(32, 41, 73, .12); }
.logo { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 22px; }
.logo-mark { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: var(--brand); color: white; }
h1 { margin: 20px 0 8px; font-size: 25px; }
.help { color: var(--muted); line-height: 1.5; }
.field { display: grid; gap: 8px; margin-top: 22px; }
.field label { font-weight: 700; }
.field input, .composer textarea, .search { width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: white; color: var(--text); outline: none; }
.field input:focus, .composer textarea:focus, .search:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(91,54,201,.12); }
.primary { border: 0; border-radius: 12px; padding: 12px 18px; background: var(--brand); color: white; font-weight: 800; }
.primary:hover { background: var(--brand-dark); }
.login-card .primary { width: 100%; margin-top: 18px; }
.alert { margin-top: 16px; border-radius: 12px; padding: 12px; background: #fee4e2; color: var(--danger); font-weight: 700; }
.app-shell { height: 100vh; height: 100dvh; overflow: hidden; display: grid; grid-template-columns: 360px minmax(0, 1fr); background: var(--panel); }
.sidebar { border-right: 1px solid var(--border); display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.sidebar-head { padding: 18px; border-bottom: 1px solid var(--border); display: grid; gap: 14px; }
.top-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.logout { border: 1px solid var(--border); background: white; border-radius: 10px; padding: 8px 10px; color: var(--muted); }
.module-nav { display: grid; gap: 8px; }
.module-link { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: #fff; color: var(--text); text-decoration: none; }
.module-link strong { font-size: 14px; }
.module-link span { color: var(--muted); font-size: 12px; line-height: 1.35; }
.module-link:hover { border-color: var(--brand); background: #f8f6ff; }
.module-link.active { border-color: #c9bdf4; background: #f1edff; color: var(--brand-dark); }
.chat-list { overflow: auto; flex: 1; }
.chat-item { width: 100%; display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 12px; border: 0; border-bottom: 1px solid #eef1f6; background: white; text-align: left; padding: 14px 16px; }
.chat-item:hover, .chat-item.active { background: #f1edff; }
.avatar { width: 46px; height: 46px; border-radius: 50%; background: #e4e7ec; display: grid; place-items: center; font-weight: 900; color: var(--brand-dark); }
.chat-meta { min-width: 0; }
.chat-title-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.chat-name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-time { color: var(--muted); font-size: 12px; white-space: nowrap; }
.chat-preview { margin-top: 5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.pause-dot { display: inline-block; width: 8px; height: 8px; background: #f79009; border-radius: 50%; margin-right: 6px; }
.chat-area { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #efeaf7; }
.empty-state { margin: auto; text-align: center; color: var(--muted); padding: 30px; }
.empty-state h2 { color: var(--text); }
.quick-actions { width: min(660px, 100%); margin: 24px auto 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; text-align: left; }
.quick-action { display: grid; gap: 6px; padding: 18px; border: 1px solid #d8cff3; border-radius: 16px; background: rgba(255,255,255,.78); color: var(--text); text-decoration: none; box-shadow: 0 8px 24px rgba(64,32,157,.06); }
.quick-action:hover { border-color: var(--brand); background: #fff; transform: translateY(-1px); }
.quick-action strong { color: var(--brand-dark); font-size: 16px; }
.quick-action span { line-height: 1.45; font-size: 13px; }
.chat-header { background: white; border-bottom: 1px solid var(--border); padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.contact-name { font-weight: 900; }
.contact-phone, .pause-state { color: var(--muted); font-size: 13px; margin-top: 3px; }
.pause-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.secondary { border: 1px solid var(--border); background: white; border-radius: 10px; padding: 8px 10px; color: var(--text); }
.secondary:hover { border-color: var(--brand); color: var(--brand); }
.messages { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
.message { max-width: min(72%, 680px); padding: 10px 12px 7px; border-radius: 14px; box-shadow: 0 1px 1px rgba(16,24,40,.08); white-space: pre-wrap; overflow-wrap: anywhere; }
.message.inbound { align-self: flex-start; background: var(--inbound); border-top-left-radius: 4px; }
.message.outbound { align-self: flex-end; background: var(--outbound); border-top-right-radius: 4px; }
.message-text { line-height: 1.45; }
.attachment { margin-bottom: 6px; }
.attachment audio { width: 260px; max-width: 100%; display: block; }
.attachment img, .attachment video { max-width: 260px; max-height: 300px; border-radius: 10px; display: block; cursor: pointer; }
.attachment-file { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; background: rgba(0,0,0,.05); color: var(--brand-dark); text-decoration: none; font-size: 14px; font-weight: 600; }
.attachment-file:hover { background: rgba(0,0,0,.09); }
.message-foot { margin-top: 5px; display: flex; justify-content: flex-end; gap: 7px; font-size: 11px; color: var(--muted); }
.status-failed { color: var(--danger); font-weight: 800; }
.status-read, .status-delivered { color: var(--success); font-weight: 800; }
.composer { background: white; border-top: 1px solid var(--border); padding: 14px 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
.composer textarea { resize: none; min-height: 46px; max-height: 140px; }
.composer .primary { min-height: 46px; }
.toast { position: fixed; right: 22px; bottom: 22px; padding: 12px 16px; border-radius: 12px; color: white; background: #1d2939; box-shadow: 0 12px 30px rgba(16,24,40,.2); z-index: 20; }
.toast.error { background: var(--danger); }
.hidden { display: none !important; }
.mobile-back { display: none; }
@media (max-width: 760px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { border-right: 0; }
  .chat-area { position: fixed; inset: 0; z-index: 10; transform: translateX(100%); transition: transform .2s ease; }
  .app-shell.chat-open .chat-area { transform: translateX(0); }
  .mobile-back { display: inline-flex; border: 0; background: transparent; font-size: 22px; padding: 6px; }
  .chat-header { align-items: flex-start; }
  .pause-actions { max-width: 160px; }
  .message { max-width: 88%; }
  .messages { padding: 16px; }
  .composer { padding: 10px; }
  .quick-actions { grid-template-columns: 1fr; }
}
`;

export const LOGIN_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ingresar — CityCred WhatsApp</title>
  <link rel="stylesheet" href="/admin/assets/app.css">
</head>
<body class="login-page">
  <main class="login-card">
    <div class="logo"><span class="logo-mark">C</span> CityCred WhatsApp</div>
    <h1>Ingresar al panel</h1>
    <p class="help">Usá la contraseña privada configurada para administrar conversaciones.</p>
    <form method="post" action="/admin/login">
      <div class="field">
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      </div>
      <button class="primary" type="submit">Entrar</button>
    </form>
    <!--ERROR-->
  </main>
</body>
</html>`;

export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CityCred WhatsApp</title>
  <link rel="stylesheet" href="/admin/assets/app.css">
</head>
<body>
  <main class="app-shell" id="appShell">
    <aside class="sidebar">
      <header class="sidebar-head">
        <div class="top-row">
          <div class="logo"><span class="logo-mark">C</span> CityCred</div>
          <button class="logout" id="logoutButton" type="button">Salir</button>
        </div>
        <nav class="module-nav" aria-label="Módulos principales">
          <a class="module-link active" href="/admin">
            <strong>Conversaciones</strong>
            <span>Bandeja y respuesta a clientes</span>
          </a>
          <a class="module-link" href="/admin/crm">
            <strong>CRM y campañas</strong>
            <span>Clientes, equipo, etiquetas, plantillas y estadísticas</span>
          </a>
          <a class="module-link" data-admin-only href="/admin/platform">
            <strong>Plataforma WhatsApp</strong>
            <span>Bot, seguimientos, cuenta, catálogo, Flows y métricas</span>
          </a>
        </nav>
        <input class="search" id="searchInput" type="search" placeholder="Buscar nombre o número">
      </header>
      <div class="chat-list" id="chatList"></div>
    </aside>
    <section class="chat-area" id="chatArea">
      <div class="empty-state" id="emptyState">
        <h2>Conversaciones</h2>
        <p>Elegí un cliente para leer y responder mensajes.</p>
        <div class="quick-actions">
          <a class="quick-action" href="/admin/crm">
            <strong>Abrir CRM y campañas</strong>
            <span>Gestioná clientes, equipo, etiquetas, respuestas rápidas, plantillas, campañas y estadísticas.</span>
          </a>
          <a class="quick-action" data-admin-only href="/admin/platform">
            <strong>Abrir Plataforma WhatsApp</strong>
            <span>Configurá bot y seguimientos, cuenta comercial, catálogo, WhatsApp Flows y métricas oficiales.</span>
          </a>
        </div>
      </div>
      <header class="chat-header hidden" id="chatHeader">
        <div class="top-row">
          <button class="mobile-back" id="backButton" type="button" aria-label="Volver">←</button>
          <div>
            <div class="contact-name" id="contactName"></div>
            <div class="contact-phone" id="contactPhone"></div>
            <div class="pause-state" id="pauseState"></div>
          </div>
        </div>
        <div class="pause-actions">
          <button class="secondary" data-pause="5" type="button">Pausar 5 min</button>
          <button class="secondary" data-pause="60" type="button">1 hora</button>
          <button class="secondary" data-pause="1440" type="button">24 horas</button>
          <button class="secondary" data-pause="0" type="button">Reactivar</button>
        </div>
      </header>
      <div class="messages hidden" id="messages"></div>
      <form class="composer hidden" id="composer">
        <textarea id="messageInput" maxlength="4096" placeholder="Escribí un mensaje" required></textarea>
        <button class="primary" type="submit">Enviar</button>
      </form>
    </section>
  </main>
  <div class="toast hidden" id="toast"></div>
  <script src="/admin/assets/app.js" defer></script>
</body>
</html>`;

export const ADMIN_JS = String.raw`
(function () {
  'use strict';

  var conversations = [];
  var selectedWaId = null;
  var refreshTimer = null;
  var appShell = document.getElementById('appShell');
  var chatList = document.getElementById('chatList');
  var searchInput = document.getElementById('searchInput');
  var emptyState = document.getElementById('emptyState');
  var chatHeader = document.getElementById('chatHeader');
  var messagesElement = document.getElementById('messages');
  var composer = document.getElementById('composer');
  var messageInput = document.getElementById('messageInput');
  var contactName = document.getElementById('contactName');
  var contactPhone = document.getElementById('contactPhone');
  var pauseState = document.getElementById('pauseState');
  var toast = document.getElementById('toast');

  function showToast(message, error) {
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.remove('hidden');
    window.setTimeout(function () { toast.classList.add('hidden'); }, 3200);
  }

  async function api(path, options) {
    var response = await fetch('/admin/api' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    }, options || {}));
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  }

  function formatTime(value) {
    if (!value) return '';
    var date = new Date(value);
    var today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  function displayName(conversation) {
    return conversation.profileName || conversation.phone || conversation.waId;
  }

  function initials(value) {
    return String(value || '?').trim().slice(0, 2).toUpperCase();
  }

  function isPaused(conversation) {
    return conversation && conversation.botPausedUntil && new Date(conversation.botPausedUntil) > new Date();
  }

  function renderConversations() {
    var query = searchInput.value.trim().toLowerCase();
    chatList.replaceChildren();
    conversations
      .filter(function (item) {
        return !query || displayName(item).toLowerCase().includes(query) || item.waId.includes(query);
      })
      .forEach(function (item) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'chat-item' + (item.waId === selectedWaId ? ' active' : '');
        button.addEventListener('click', function () { selectConversation(item.waId); });

        var avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = initials(displayName(item));

        var meta = document.createElement('span');
        meta.className = 'chat-meta';
        var titleRow = document.createElement('span');
        titleRow.className = 'chat-title-row';
        var name = document.createElement('span');
        name.className = 'chat-name';
        if (isPaused(item)) {
          var dot = document.createElement('span');
          dot.className = 'pause-dot';
          name.appendChild(dot);
        }
        name.appendChild(document.createTextNode(displayName(item)));
        var time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = formatTime(item.lastMessageAt);
        titleRow.append(name, time);
        var preview = document.createElement('span');
        preview.className = 'chat-preview';
        preview.textContent = item.lastMessageText || 'Sin texto';
        meta.append(titleRow, preview);
        button.append(avatar, meta);
        chatList.appendChild(button);
      });
  }

  async function loadConversations() {
    try {
      var data = await api('/conversations?limit=200');
      conversations = data.conversations || [];
      renderConversations();
      if (selectedWaId) updateHeader();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function updateHeader() {
    var item = conversations.find(function (conversation) { return conversation.waId === selectedWaId; });
    if (!item) return;
    contactName.textContent = displayName(item);
    contactPhone.textContent = '+' + item.waId;
    pauseState.textContent = isPaused(item)
      ? 'Bot pausado hasta ' + new Date(item.botPausedUntil).toLocaleString('es-AR')
      : 'Bot activo';
  }

  function messageStatusLabel(status) {
    var labels = {
      UNKNOWN: 'Sin confirmar', PENDING: 'Pendiente', SENT: 'Enviado',
      DELIVERED: 'Entregado', READ: 'Leído', FAILED: 'Falló', RECEIVED: 'Recibido'
    };
    return labels[status] || status;
  }

  function humanFileSize(bytes) {
    if (!bytes || bytes < 1024) return '';
    if (bytes < 1048576) return ' (' + Math.round(bytes / 1024) + ' KB)';
    return ' (' + (bytes / 1048576).toFixed(1) + ' MB)';
  }

  /** Arma el reproductor/vista previa del adjunto de un mensaje. */
  function buildAttachment(attachment) {
    var source = '/admin/api/media/attachments/' + encodeURIComponent(attachment.id);
    var kind = String(attachment.mediaType || '').toLowerCase();
    var mime = String(attachment.mimeType || '').toLowerCase();
    var wrap = document.createElement('div');
    wrap.className = 'attachment';

    if (kind === 'audio' || kind === 'voice' || mime.indexOf('audio/') === 0) {
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = source;
      wrap.appendChild(audio);
      return wrap;
    }

    if (kind === 'image' || kind === 'sticker' || mime.indexOf('image/') === 0) {
      var link = document.createElement('a');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noopener';
      var img = document.createElement('img');
      img.src = source;
      img.alt = attachment.filename || 'Imagen recibida';
      img.loading = 'lazy';
      link.appendChild(img);
      wrap.appendChild(link);
      return wrap;
    }

    if (kind === 'video' || mime.indexOf('video/') === 0) {
      var video = document.createElement('video');
      video.controls = true;
      video.preload = 'none';
      video.src = source;
      wrap.appendChild(video);
      return wrap;
    }

    var fileLink = document.createElement('a');
    fileLink.className = 'attachment-file';
    fileLink.href = source;
    fileLink.target = '_blank';
    fileLink.rel = 'noopener';
    fileLink.textContent = '📎 ' + (attachment.filename || 'Abrir archivo')
      + humanFileSize(attachment.sizeBytes);
    wrap.appendChild(fileLink);
    return wrap;
  }

  async function loadMessages(scrollToBottom) {
    if (!selectedWaId) return;
    try {
      var data = await api('/conversations/' + encodeURIComponent(selectedWaId) + '/messages?limit=500');
      // Los adjuntos vienen aparte: se cruzan por messageId. Si falla, se
      // muestran igual los mensajes (el chat nunca queda en blanco).
      var attachmentsByMessage = {};
      try {
        var media = await api('/media/conversations/' + encodeURIComponent(selectedWaId) + '/attachments?limit=500');
        (media.attachments || []).forEach(function (attachment) {
          if (attachment.downloadStatus === 'DELETED') return;
          attachmentsByMessage[attachment.messageId] = attachment;
        });
      } catch (mediaError) { /* sin adjuntos disponibles */ }

      var items = (data.messages || []).slice().reverse();
      messagesElement.replaceChildren();
      items.forEach(function (item) {
        var bubble = document.createElement('article');
        bubble.className = 'message ' + (item.direction === 'OUTBOUND' ? 'outbound' : 'inbound');
        var attachment = attachmentsByMessage[item.id];
        if (attachment) bubble.appendChild(buildAttachment(attachment));
        var text = document.createElement('div');
        text.className = 'message-text';
        // Con adjunto, el texto suele ser un relleno ("[Audio]" o el nombre del
        // archivo) que ya se ve en el reproductor: en ese caso no se repite.
        var raw = item.text || '';
        var esRelleno = /^\[.*\]$/.test(raw)
          || (attachment && raw === attachment.filename);
        var caption = attachment
          ? (esRelleno ? (attachment.caption || '') : (raw || attachment.caption || ''))
          : raw;
        text.textContent = caption || (attachment ? '' : '[' + item.type + ']');
        if (!text.textContent) text.classList.add('hidden');
        var foot = document.createElement('div');
        foot.className = 'message-foot';
        var time = document.createElement('span');
        time.textContent = new Date(item.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        var status = document.createElement('span');
        status.textContent = messageStatusLabel(item.status);
        status.className = 'status-' + String(item.status).toLowerCase();
        foot.append(time, status);
        bubble.append(text, foot);
        if (item.errorMessage) bubble.title = item.errorMessage;
        messagesElement.appendChild(bubble);
      });
      if (scrollToBottom) messagesElement.scrollTop = messagesElement.scrollHeight;
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function selectConversation(waId) {
    selectedWaId = waId;
    renderConversations();
    updateHeader();
    emptyState.classList.add('hidden');
    chatHeader.classList.remove('hidden');
    messagesElement.classList.remove('hidden');
    composer.classList.remove('hidden');
    appShell.classList.add('chat-open');
    await loadMessages(true);
    // preventScroll evita que el navegador arrastre la página hasta el campo
    // de escritura: sin esto, abrir un chat saltaba al final de la página.
    try {
      messageInput.focus({ preventScroll: true });
    } catch (error) {
      messageInput.focus();
    }
  }

  composer.addEventListener('submit', async function (event) {
    event.preventDefault();
    var body = messageInput.value.trim();
    if (!body || !selectedWaId) return;
    var submit = composer.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api('/messages/text', {
        method: 'POST',
        body: JSON.stringify({ to: selectedWaId, body: body })
      });
      messageInput.value = '';
      await Promise.all([loadConversations(), loadMessages(true)]);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  messageInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  document.querySelectorAll('[data-pause]').forEach(function (button) {
    button.addEventListener('click', async function () {
      if (!selectedWaId) return;
      var minutes = Number(button.getAttribute('data-pause'));
      try {
        await api('/conversations/' + encodeURIComponent(selectedWaId) + '/pause', {
          method: 'POST',
          body: JSON.stringify({ minutes: minutes })
        });
        await loadConversations();
        showToast(minutes === 0 ? 'Bot reactivado' : 'Bot pausado');
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  searchInput.addEventListener('input', renderConversations);
  document.getElementById('backButton').addEventListener('click', function () {
    appShell.classList.remove('chat-open');
  });
  document.getElementById('logoutButton').addEventListener('click', async function () {
    await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/admin/login';
  });

  loadConversations();
  refreshTimer = window.setInterval(function () {
    loadConversations();
    if (selectedWaId) loadMessages(false);
  }, 5000);
  window.addEventListener('beforeunload', function () { window.clearInterval(refreshTimer); });
})();
`;
