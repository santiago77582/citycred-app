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
      <button class="menu-item" data-view="campaigns" type="button">Campañas</button>
      <button class="menu-item" data-view="analytics" type="button">Estadísticas</button>
    </aside>

    <section class="content">
      <section id="contactsView" class="view">
        <div class="view-head">
          <div><h1>Clientes</h1><p>Ficha comercial, estado, consentimiento y asesor responsable.</p></div>
          <div class="view-head-actions">
            <button id="openContactImport" class="secondary" type="button">Importar CSV / Excel</button>
            <button id="refreshContacts" class="secondary" type="button">Actualizar</button>
          </div>
        </div>
        <section id="contactImportPanel" class="contact-import-panel hidden">
          <div>
            <h2>Importar clientes</h2>
            <p>Primero se genera una vista previa. Ninguna fila se guarda hasta confirmar.</p>
          </div>
          <label class="contact-import-file">Archivo .csv o .xlsx, máximo 5 MB
            <input id="contactImportFile" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
          </label>
          <div class="contact-import-actions">
            <button id="previewContactImport" class="primary" type="button">Revisar archivo</button>
            <button id="commitContactImport" class="primary hidden" type="button">Confirmar importación</button>
            <button id="closeContactImport" class="ghost" type="button">Cerrar</button>
          </div>
          <div id="contactImportResult" class="contact-import-result muted">Todavía no se revisó ningún archivo.</div>
        </section>
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

      <section id="campaignsView" class="view hidden">
        <div class="view-head">
          <div>
            <h1>Campañas</h1>
            <p>Borradores, segmentación y vista previa de destinatarios.</p>
          </div>
          <button id="newCampaign" class="primary" type="button">Nuevo borrador</button>
        </div>
        <div id="campaignLockNotice" class="campaign-lock-notice">
          <strong>Envío desactivado.</strong> Se pueden preparar, simular y aprobar campañas, pero no ejecutarlas.
        </div>

        <div class="campaign-layout">
          <section class="campaign-sidebar">
            <div id="campaignList" class="campaign-list"></div>
          </section>

          <section class="campaign-workspace">
            <form id="campaignForm" class="campaign-form hidden">
              <input id="campaignId" type="hidden">
              <div class="campaign-form-head">
                <div><h2 id="campaignFormTitle">Nuevo borrador</h2><p>Todos los filtros se vuelven a validar al generar la vista previa.</p></div>
                <button id="closeCampaignForm" class="ghost" type="button">Cerrar</button>
              </div>
              <div class="form-grid">
                <label>Nombre de la campaña<input id="campaignName" maxlength="150" required></label>
                <label>Plantilla aprobada<select id="campaignTemplate" required></select></label>
                <label class="wide">Buscar dentro de clientes<input id="campaignSearch" maxlength="200" placeholder="Nombre, teléfono, DNI o entidad"></label>
                <label class="wide">Entidades específicas<input id="campaignEntities" maxlength="1000" placeholder="Separadas por coma, por ejemplo: Educación RN, Ejército"></label>
              </div>
              <fieldset class="campaign-fieldset">
                <legend>Estados comerciales</legend>
                <div id="campaignStatuses" class="campaign-check-grid"></div>
              </fieldset>
              <fieldset class="campaign-fieldset">
                <legend>Etiquetas</legend>
                <div id="campaignLabels" class="campaign-check-grid"></div>
              </fieldset>
              <section id="campaignVariables" class="campaign-variables hidden">
                <h3>Valores fijos de la plantilla</h3>
                <p>Se usarían iguales para toda la audiencia. El envío sigue desactivado.</p>
                <div id="campaignVariableFields" class="form-grid"></div>
              </section>
              <div class="campaign-form-actions">
                <button id="saveCampaign" class="primary" type="submit">Guardar borrador</button>
              </div>
            </form>

            <section id="campaignDetail" class="campaign-detail">
              <div class="empty">Elegí una campaña o creá un nuevo borrador.</div>
            </section>
          </section>
        </div>
      </section>

      <section id="analyticsView" class="view hidden">
        <div class="view-head analytics-head">
          <div>
            <h1>Estadísticas</h1>
            <p>Actividad operativa del CRM y WhatsApp. Esta sección es de solo lectura.</p>
          </div>
          <div class="analytics-controls">
            <label for="analyticsDays">Período</label>
            <select id="analyticsDays">
              <option value="7">Últimos 7 días</option>
              <option value="30" selected>Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Últimos 365 días</option>
            </select>
            <button id="refreshAnalytics" class="secondary" type="button">Actualizar</button>
          </div>
        </div>
        <div id="analyticsLimitNotice" class="analytics-limit-notice hidden"></div>
        <div id="analyticsKpis" class="analytics-kpis"></div>
        <div class="analytics-grid">
          <section class="analytics-panel analytics-panel-wide">
            <div class="analytics-panel-head"><h2>Actividad diaria</h2><span id="analyticsPeriodLabel"></span></div>
            <div id="analyticsDailyChart" class="analytics-daily-chart"></div>
          </section>
          <section class="analytics-panel">
            <h2>Consentimiento</h2>
            <div id="analyticsConsent" class="analytics-bars"></div>
          </section>
          <section class="analytics-panel">
            <h2>Estado de mensajes</h2>
            <div id="analyticsMessageStatus" class="analytics-bars"></div>
          </section>
          <section class="analytics-panel">
            <h2>Principales entidades</h2>
            <div id="analyticsEntities" class="analytics-bars"></div>
          </section>
          <section class="analytics-panel">
            <h2>Estados comerciales</h2>
            <div id="analyticsCommercialStatus" class="analytics-bars"></div>
          </section>
          <section class="analytics-panel analytics-panel-wide">
            <h2>Operación y alertas</h2>
            <div id="analyticsOperations" class="analytics-operation-grid"></div>
          </section>
        </div>
        <p id="analyticsUpdatedAt" class="analytics-updated-at"></p>
      </section>
    </section>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script src="/admin/assets/crm.js" defer></script>
</body>
</html>`;
