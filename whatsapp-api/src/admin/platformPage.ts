export const PLATFORM_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Plataforma — CityCred WhatsApp</title>
  <link rel="stylesheet" href="/admin/assets/platform.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/admin"><span class="brand-mark">C</span> CityCred</a>
    <nav>
      <a href="/admin">Conversaciones</a>
      <a href="/admin/crm">CRM</a>
      <a class="active" href="/admin/platform">Plataforma</a>
    </nav>
    <button id="logoutButton" class="ghost" type="button">Salir</button>
  </header>

  <main class="layout">
    <aside class="menu">
      <button class="menu-item active" data-view="overview" type="button">Resumen</button>
      <button class="menu-item" data-view="bot" type="button">Bot y seguimientos</button>
      <button class="menu-item" data-view="account" type="button">Cuenta y perfil</button>
      <button class="menu-item" data-view="commerce" type="button">Catálogo y productos</button>
      <button class="menu-item" data-view="flows" type="button">WhatsApp Flows</button>
      <button class="menu-item" data-view="metaAnalytics" type="button">Métricas de Meta</button>
    </aside>

    <section class="content">
      <section id="overviewView" class="view">
        <div class="view-head">
          <div><h1>Estado de la plataforma</h1><p>Resumen del bot, Meta, calidad, cuenta y módulos oficiales.</p></div>
          <button id="refreshOverview" class="secondary" type="button">Actualizar</button>
        </div>
        <div class="notice warning"><strong>Nada se activa solo.</strong> El bot, los seguimientos y cualquier cambio de Meta requieren una acción confirmada desde este panel.</div>
        <div id="overviewKpis" class="kpis"></div>
        <div class="grid">
          <section class="card"><div class="card-head"><h2>Último estado de Meta</h2></div><div id="overviewMetaState" class="list"></div></section>
          <section class="card"><div class="card-head"><h2>Capacidades</h2></div><div id="overviewCapabilities" class="list"></div></section>
        </div>
      </section>

      <section id="botView" class="view hidden">
        <div class="view-head">
          <div><h1>Bot y seguimientos</h1><p>Reglas comerciales de CityCred, simulación y cola automática.</p></div>
          <button id="refreshBot" class="secondary" type="button">Actualizar</button>
        </div>
        <div class="notice danger"><strong>Control de seguridad:</strong> activar el bot o los seguimientos cambia el comportamiento automático. El panel pedirá confirmación.</div>
        <div class="grid">
          <form id="botSettingsForm" class="card">
            <div class="card-head"><h2>Configuración general</h2><span id="botStatusPill" class="status-pill off">Apagado</span></div>
            <div class="switch-row"><div><strong>Responder automáticamente</strong><div class="muted">Usa las reglas comerciales cargadas.</div></div><input id="botEnabled" type="checkbox"></div>
            <div class="switch-row" style="margin-top:10px"><div><strong>Seguimientos automáticos</strong><div class="muted">3 h, 24 h, 48 h y 7 días.</div></div><input id="followupsEnabled" type="checkbox"></div>
            <div class="form-grid" style="margin-top:14px">
              <label>Desde<input id="businessHourStart" type="number" min="0" max="23" required></label>
              <label>Hasta<input id="businessHourEnd" type="number" min="1" max="24" required></label>
            </div>
            <div class="actions"><button class="primary" type="submit">Guardar con confirmación</button></div>
          </form>

          <form id="botPreviewForm" class="card">
            <div class="card-head"><h2>Simular sin enviar</h2><span class="status-pill">Prueba segura</span></div>
            <div class="form-grid">
              <label class="wide">Número del cliente<input id="botPreviewWaId" placeholder="549291..." required></label>
              <label class="wide">Mensaje de prueba<textarea id="botPreviewText" placeholder="Ejemplo: Soy de Ejército, de carrera, tengo 2 años y $85.000 de cupo"></textarea></label>
              <label>ID de botón o lista<input id="botPreviewInteractiveId" placeholder="entity:army"></label>
              <label>Tipo<select id="botPreviewMessageType"><option value="text">Texto</option><option value="interactive">Interactivo</option><option value="document">Documento</option><option value="image">Imagen</option></select></label>
            </div>
            <div class="actions"><button class="secondary" type="submit">Ver decisión</button></div>
            <pre id="botPreviewResult">Todavía no se ejecutó una simulación.</pre>
          </form>
        </div>

        <section class="card wide">
          <div class="card-head"><h2>Próximos seguimientos</h2><select id="followupStatusFilter"><option value="PENDING">Pendientes</option><option value="PROCESSING">Procesando</option><option value="SENT">Enviados</option><option value="SKIPPED">Omitidos</option><option value="CANCELLED">Cancelados</option><option value="FAILED">Fallidos</option><option value="">Todos</option></select></div>
          <div id="followupsTable" class="table-wrap"></div>
        </section>
        <section class="card wide"><div class="card-head"><h2>Cola del bot</h2></div><div id="botJobsTable" class="table-wrap"></div></section>
      </section>

      <section id="accountView" class="view hidden">
        <div class="view-head"><div><h1>Cuenta y perfil comercial</h1><p>Información oficial consultada y modificada mediante Meta.</p></div><button id="refreshAccount" class="secondary" type="button">Actualizar</button></div>
        <div class="grid three" id="phoneStatusCards"></div>
        <div class="grid">
          <form id="profileForm" class="card">
            <div class="card-head"><h2>Perfil comercial</h2></div>
            <div class="form-grid">
              <label class="wide">Acerca de<input id="profileAbout" maxlength="139"></label>
              <label class="wide">Descripción<textarea id="profileDescription" maxlength="256"></textarea></label>
              <label class="wide">Dirección<input id="profileAddress" maxlength="256"></label>
              <label>Correo<input id="profileEmail" type="email" maxlength="128"></label>
              <label>Categoría<select id="profileVertical"><option value="UNDEFINED">Sin definir</option><option value="FINANCE">Finanzas</option><option value="PROF_SERVICES">Servicios profesionales</option><option value="OTHER">Otra</option></select></label>
              <label class="wide">Sitios web, uno por línea<textarea id="profileWebsites"></textarea></label>
            </div>
            <div class="actions"><button class="primary" type="submit">Guardar perfil</button></div>
          </form>
          <form id="profilePictureForm" class="card">
            <div class="card-head"><h2>Foto del perfil</h2></div>
            <img id="profilePicturePreview" alt="Foto comercial" style="width:120px;height:120px;object-fit:cover;border-radius:18px;border:1px solid var(--border);background:#f2f4f7">
            <label style="margin-top:14px">Nueva imagen JPEG o PNG<input id="profilePictureFile" type="file" accept="image/jpeg,image/png" required></label>
            <div class="notice warning" style="margin-top:14px">Meta procesa la imagen y puede demorar en mostrar el cambio.</div>
            <div class="actions"><button class="primary" type="submit">Cargar y aplicar</button></div>
          </form>
        </div>
        <section class="card wide"><div class="card-head"><h2>Eventos recientes de Meta</h2><select id="accountEventFilter"><option value="">Todos</option><option value="phone_number_quality_update">Calidad y límite</option><option value="phone_number_name_update">Nombre</option><option value="account_update">Cuenta</option><option value="account_review_update">Revisión</option><option value="message_template_status_update">Plantillas</option></select></div><div id="accountEventsTable" class="table-wrap"></div></section>
      </section>

      <section id="commerceView" class="view hidden">
        <div class="view-head"><div><h1>Catálogo y productos</h1><p>Configuración comercial y mensajes oficiales de productos.</p></div><button id="refreshCommerce" class="secondary" type="button">Actualizar</button></div>
        <div class="grid">
          <form id="commerceSettingsForm" class="card">
            <div class="card-head"><h2>Configuración de comercio</h2></div>
            <div class="switch-row"><span>Mostrar catálogo</span><input id="catalogVisible" type="checkbox"></div>
            <div class="switch-row" style="margin-top:10px"><span>Habilitar carrito</span><input id="cartEnabled" type="checkbox"></div>
            <div class="actions"><button class="primary" type="submit">Guardar</button></div>
          </form>
          <section class="card"><div class="card-head"><h2>Estado recibido</h2></div><pre id="commerceState">Sin consultar.</pre></section>
        </div>
        <div class="grid three">
          <form id="productForm" class="card">
            <h2>Enviar un producto</h2>
            <label>Número<input id="productTo" required></label>
            <label>Catálogo ID<input id="productCatalogId" required></label>
            <label>Producto ID<input id="productRetailerId" required></label>
            <label>Texto<textarea id="productBody">Conocé este producto</textarea></label>
            <div class="actions"><button class="primary" type="submit">Enviar producto</button></div>
          </form>
          <form id="catalogForm" class="card">
            <h2>Enviar catálogo</h2>
            <label>Número<input id="catalogTo" required></label>
            <label>Texto<textarea id="catalogBody" required>Abrí nuestro catálogo</textarea></label>
            <label>Producto de portada<input id="catalogThumbnail"></label>
            <div class="actions"><button class="primary" type="submit">Enviar catálogo</button></div>
          </form>
          <form id="productListForm" class="card">
            <h2>Enviar varios productos</h2>
            <label>Número<input id="productListTo" required></label>
            <label>Catálogo ID<input id="productListCatalogId" required></label>
            <label>Título<input id="productListHeader" value="Productos" required></label>
            <label>Texto<textarea id="productListBody" required>Elegí una opción</textarea></label>
            <label>IDs de productos, uno por línea<textarea id="productListIds" required></textarea></label>
            <div class="actions"><button class="primary" type="submit">Enviar lista</button></div>
          </form>
        </div>
      </section>

      <section id="flowsView" class="view hidden">
        <div class="view-head"><div><h1>WhatsApp Flows</h1><p>Formularios nativos dentro de WhatsApp.</p></div><button id="refreshFlows" class="secondary" type="button">Actualizar</button></div>
        <div class="notice warning">Publicar, retirar o borrar un Flow es una operación real en Meta y exige confirmación.</div>
        <div class="grid">
          <section class="card"><div class="card-head"><h2>Flows disponibles</h2></div><div id="flowList" class="list"></div></section>
          <form id="flowCreateForm" class="card">
            <h2>Crear o clonar</h2>
            <label>Nombre<input id="flowName" required></label>
            <label>Categoría<select id="flowCategory"><option value="LEAD_GENERATION">Generación de leads</option><option value="SURVEY">Encuesta</option><option value="CUSTOMER_SUPPORT">Atención</option><option value="CONTACT_US">Contacto</option><option value="OTHER">Otra</option></select></label>
            <label>Clonar Flow ID<input id="flowCloneId"></label>
            <label>Endpoint HTTPS<input id="flowEndpoint" type="url"></label>
            <div class="actions"><button class="primary" type="submit">Crear borrador</button></div>
          </form>
        </div>
        <section id="flowWorkspace" class="card wide hidden">
          <div class="card-head"><div><h2 id="selectedFlowTitle">Flow</h2><span id="selectedFlowStatus" class="status-pill"></span></div><button id="closeFlowWorkspace" class="ghost" type="button">Cerrar</button></div>
          <input id="selectedFlowId" type="hidden">
          <div class="tabs"><button class="tab active" data-flow-tab="json" type="button">JSON</button><button class="tab" data-flow-tab="send" type="button">Enviar</button><button class="tab" data-flow-tab="details" type="button">Detalles</button></div>
          <div id="flowJsonTab">
            <label>Definición JSON<textarea id="flowJson" style="min-height:360px" spellcheck="false"></textarea></label>
            <div class="actions"><button id="saveFlowJson" class="primary" type="button">Validar y guardar JSON</button><button id="publishFlow" class="secondary" type="button">Publicar</button><button id="deprecateFlow" class="secondary" type="button">Retirar</button><button id="deleteFlow" class="danger" type="button">Borrar borrador</button></div>
          </div>
          <form id="flowSendTab" class="hidden">
            <div class="form-grid">
              <label>Número<input id="flowSendTo" required></label>
              <label>Botón<input id="flowSendCta" value="Completar datos" maxlength="30" required></label>
              <label class="wide">Mensaje<textarea id="flowSendBody" required>Completá el formulario para continuar.</textarea></label>
              <label>Pantalla inicial<input id="flowSendScreen" placeholder="INICIO"></label>
              <label>Token<input id="flowSendToken" placeholder="Se genera automáticamente"></label>
              <label class="wide">Datos iniciales JSON<textarea id="flowSendData">{}</textarea></label>
            </div>
            <div class="actions"><button class="primary" type="submit">Enviar Flow publicado</button></div>
          </form>
          <pre id="flowDetailsTab" class="hidden"></pre>
        </section>
      </section>

      <section id="metaAnalyticsView" class="view hidden">
        <div class="view-head"><div><h1>Métricas oficiales de Meta</h1><p>Datos devueltos por la cuenta; no se inventan costos.</p></div><button id="refreshMetaAnalytics" class="secondary" type="button">Consultar</button></div>
        <form id="metaAnalyticsForm" class="card">
          <div class="form-grid three">
            <label>Desde<input id="metaStart" type="datetime-local" required></label>
            <label>Hasta<input id="metaEnd" type="datetime-local" required></label>
            <label>Dimensiones<select id="metaDimensions"><option value="conversation_type,country">Tipo y país</option><option value="conversation_direction,phone">Dirección y número</option><option value="country">País</option></select></label>
          </div>
        </form>
        <div class="grid">
          <section class="card"><div class="card-head"><h2>WABA</h2></div><pre id="wabaAnalytics"></pre></section>
          <section class="card"><div class="card-head"><h2>Mensajes</h2></div><pre id="messageAnalytics"></pre></section>
          <section class="card wide"><div class="card-head"><h2>Conversaciones</h2></div><pre id="conversationAnalytics"></pre></section>
        </div>
      </section>
    </section>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script src="/admin/assets/platform.js" defer></script>
</body>
</html>`;
