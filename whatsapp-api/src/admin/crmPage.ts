export const CRM_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CRM — CityCred WhatsApp</title>
  <link rel="stylesheet" href="/admin/assets/crm.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/admin"><span class="brand-mark">C</span> CityCred</a>
    <nav>
      <a href="/admin">Conversaciones</a>
      <a class="active" href="/admin/crm">CRM</a>
    </nav>
    <button id="logoutButton" class="ghost" type="button">Salir</button>
  </header>

  <main class="layout">
    <aside class="menu">
      <button class="menu-item active" data-view="contacts" type="button">Clientes</button>
      <button class="menu-item" data-view="team" type="button">Equipo</button>
      <button class="menu-item" data-view="labels" type="button">Etiquetas</button>
      <button class="menu-item" data-view="quickReplies" type="button">Respuestas rápidas</button>
      <button class="menu-item" data-view="templates" type="button">Plantillas de Meta</button>
    </aside>

    <section class="content">
      <section id="contactsView" class="view">
        <div class="view-head">
          <div><h1>Clientes</h1><p>Ficha comercial, estado, consentimiento y asesor responsable.</p></div>
          <button id="refreshContacts" class="secondary" type="button">Actualizar</button>
        </div>
        <div class="filters">
          <input id="contactSearch" type="search" placeholder="Buscar nombre, teléfono o DNI">
          <select id="statusFilter">
            <option value="">Todos los estados</option>
            <option value="NEW">Nuevo</option>
            <option value="PENDING">Pendiente</option>
            <option value="INTERESTED">Interesado</option>
            <option value="DOCUMENTATION_PENDING">Falta documentación</option>
            <option value="UNDER_REVIEW">En análisis</option>
            <option value="APPROVED">Aprobado</option>
            <option value="REJECTED">Rechazado</option>
            <option value="FINALIZED">Finalizado</option>
            <option value="DO_NOT_CONTACT">No contactar</option>
          </select>
        </div>
        <div class="split">
          <div id="contactList" class="list-panel"></div>
          <form id="contactForm" class="detail-panel hidden">
            <div class="detail-title">
              <div><h2 id="contactTitle">Cliente</h2><span id="contactPhone" class="muted"></span></div>
              <a id="openChat" class="secondary link-button" href="/admin">Abrir chat</a>
            </div>
            <div class="form-grid">
              <label>Nombre<input id="profileName" maxlength="150"></label>
              <label>Entidad<input id="entity" maxlength="100"></label>
              <label>DNI<input id="documentNumber" maxlength="30"></label>
              <label>Antigüedad<input id="seniorityRange" maxlength="50"></label>
              <label>Cupo disponible<input id="availableQuota" type="number" min="0" step="0.01"></label>
              <label>Estado<select id="commercialStatus"></select></label>
              <label>Consentimiento<select id="consentStatus">
                <option value="UNKNOWN">Sin registrar</option>
                <option value="GRANTED">Otorgado</option>
                <option value="REVOKED">Revocado</option>
              </select></label>
              <label>Asesor<select id="assignedUser"></select></label>
              <label class="wide">Observaciones<textarea id="notes" maxlength="5000" rows="5"></textarea></label>
            </div>
            <div class="actions"><button class="primary" type="submit">Guardar ficha</button></div>
          </form>
        </div>
      </section>

      <section id="teamView" class="view hidden">
        <div class="view-head"><div><h1>Equipo</h1><p>Usuarios separados y roles de acceso.</p></div></div>
        <form id="userForm" class="inline-form">
          <input id="userName" placeholder="Nombre del asesor" required>
          <input id="userEmail" type="email" placeholder="Correo" required>
          <select id="userRole"><option value="ADVISOR">Asesor</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option></select>
          <input id="userPassword" type="password" minlength="10" placeholder="Clave inicial" required>
          <button class="primary" type="submit">Crear usuario</button>
        </form>
        <div id="userList" class="cards"></div>
      </section>

      <section id="labelsView" class="view hidden">
        <div class="view-head"><div><h1>Etiquetas</h1><p>Clasificaciones para ordenar clientes y campañas.</p></div></div>
        <form id="labelForm" class="inline-form">
          <input id="labelName" placeholder="Nombre" required>
          <input id="labelDescription" placeholder="Descripción">
          <input id="labelColor" type="color" value="#5b36c9">
          <button class="primary" type="submit">Crear etiqueta</button>
        </form>
        <div id="labelList" class="cards"></div>
      </section>

      <section id="quickRepliesView" class="view hidden">
        <div class="view-head"><div><h1>Respuestas rápidas</h1><p>Textos reutilizables para atención manual.</p></div></div>
        <form id="quickReplyForm" class="stack-form">
          <div class="form-grid">
            <label>Atajo<input id="quickShortcut" placeholder="/documentacion" required></label>
            <label>Título<input id="quickTitle" required></label>
            <label>Categoría<input id="quickCategory"></label>
            <label class="wide">Mensaje<textarea id="quickBody" maxlength="4096" rows="5" required></textarea></label>
          </div>
          <button class="primary" type="submit">Guardar respuesta</button>
        </form>
        <div id="quickReplyList" class="cards"></div>
      </section>

      <section id="templatesView" class="view hidden">
        <div class="view-head">
          <div>
            <h1>Plantillas de Meta</h1>
            <p>Estados y contenido obtenidos directamente de la cuenta de WhatsApp.</p>
          </div>
          <button id="syncTemplates" class="primary" type="button">Sincronizar con Meta</button>
        </div>
        <div class="template-notice">
          Sincronizar solo actualiza la lista. No envía campañas ni mensajes.
        </div>
        <div class="filters template-filters">
          <input id="templateSearch" type="search" placeholder="Buscar plantilla o categoría">
          <select id="templateStatusFilter">
            <option value="">Todos los estados</option>
            <option value="APPROVED">Aprobada</option>
            <option value="PENDING">Pendiente</option>
            <option value="REJECTED">Rechazada</option>
            <option value="PAUSED">Pausada</option>
            <option value="DISABLED">Desactivada</option>
            <option value="NOT_FOUND">Ya no aparece en Meta</option>
          </select>
        </div>
        <div id="templateSummary" class="template-summary"></div>
        <div id="templateList" class="template-list"></div>
      </section>
    </section>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script src="/admin/assets/crm.js" defer></script>
</body>
</html>`;
