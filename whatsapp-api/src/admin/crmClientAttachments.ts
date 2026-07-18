export const CRM_ATTACHMENTS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var form = document.getElementById('contactForm');
  var actions = form.querySelector('.actions');
  var block = document.createElement('section');
  block.className = 'attachment-section';
  block.innerHTML = '<div class="attachment-head"><div><h3>Archivos recibidos</h3>' +
    '<p>Imágenes, audios, videos y documentos de esta conversación.</p></div>' +
    '<button id="refreshAttachments" class="secondary" type="button">Actualizar</button></div>' +
    '<div id="attachmentList" class="attachment-grid"><div class="empty">Elegí un cliente.</div></div>';
  actions.before(block);

  async function mediaApi(path) {
    var response = await fetch('/admin/api/media' + path, { credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los archivos');
    return data;
  }

  function sourceUrl(attachment) {
    return '/admin/api/media/attachments/' + encodeURIComponent(attachment.id);
  }

  function attachmentName(attachment) {
    return attachment.filename || attachment.caption || (
      attachment.mediaType === 'IMAGE' ? 'Imagen' :
      attachment.mediaType === 'VOICE' ? 'Nota de voz' :
      attachment.mediaType === 'AUDIO' ? 'Audio' :
      attachment.mediaType === 'VIDEO' ? 'Video' :
      attachment.mediaType === 'DOCUMENT' ? 'Documento' : 'Archivo'
    );
  }

  function renderCard(attachment) {
    var url = sourceUrl(attachment);
    var name = crm.text(attachmentName(attachment));
    var caption = attachment.caption && attachment.caption !== attachment.filename
      ? '<div class="attachment-caption">' + crm.text(attachment.caption) + '</div>'
      : '';
    var preview;
    if (attachment.mediaType === 'IMAGE' || attachment.mediaType === 'STICKER') {
      preview = '<a href="' + url + '" target="_blank" rel="noopener">' +
        '<img class="attachment-image" src="' + url + '" alt="' + name + '" loading="lazy"></a>';
    } else if (attachment.mediaType === 'AUDIO' || attachment.mediaType === 'VOICE') {
      preview = '<audio class="attachment-audio" controls preload="none" src="' + url + '"></audio>';
    } else if (attachment.mediaType === 'VIDEO') {
      preview = '<video class="attachment-video" controls preload="metadata" src="' + url + '"></video>';
    } else {
      preview = '<a class="attachment-document" href="' + url + '" target="_blank" rel="noopener">' +
        '<span class="attachment-icon">PDF</span><span>Abrir documento</span></a>';
    }
    return '<article class="attachment-card">' + preview +
      '<div class="attachment-name">' + name + '</div>' + caption + '</article>';
  }

  async function loadAttachments(contact) {
    var list = document.getElementById('attachmentList');
    if (!contact) {
      list.innerHTML = '<div class="empty">Elegí un cliente.</div>';
      return;
    }
    list.innerHTML = '<div class="empty">Cargando archivos…</div>';
    try {
      var data = await mediaApi('/conversations/' + encodeURIComponent(contact.wa_id) + '/attachments?limit=100');
      var attachments = data.attachments || [];
      list.innerHTML = attachments.length
        ? attachments.map(renderCard).join('')
        : '<div class="empty">Esta conversación todavía no tiene archivos registrados.</div>';
    } catch (error) {
      list.innerHTML = '<div class="empty">No se pudieron cargar los archivos.</div>';
      crm.showToast(error.message, true);
    }
  }

  document.getElementById('refreshAttachments').addEventListener('click', function () {
    loadAttachments(crm.state.selected);
  });
  crm.registerContactHook(function (contact) { loadAttachments(contact); });
})();
`;
