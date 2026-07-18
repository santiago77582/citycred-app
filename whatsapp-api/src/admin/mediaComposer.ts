export const MEDIA_COMPOSER_JS = String.raw`
(function () {
  'use strict';
  var composer = document.getElementById('composer');
  var messageInput = document.getElementById('messageInput');
  var toast = document.getElementById('toast');
  if (!composer || !messageInput || !toast) return;

  var mimeByExtension = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    aac: 'audio/aac', m4a: 'audio/mp4', mp3: 'audio/mpeg', amr: 'audio/amr', ogg: 'audio/ogg',
    mp4: 'video/mp4', '3gp': 'video/3gpp',
    txt: 'text/plain', pdf: 'application/pdf', doc: 'application/msword',
    xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation'
  };
  var rules = {
    'image/jpeg': { max: 5000000, name: 'Imagen', caption: true },
    'image/png': { max: 5000000, name: 'Imagen', caption: true },
    'image/webp': { max: 100000, name: 'Sticker', caption: false },
    'audio/aac': { max: 16000000, name: 'Audio', caption: false },
    'audio/mp4': { max: 16000000, name: 'Audio', caption: false },
    'audio/mpeg': { max: 16000000, name: 'Audio', caption: false },
    'audio/amr': { max: 16000000, name: 'Audio', caption: false },
    'audio/ogg': { max: 16000000, name: 'Audio', caption: false },
    'video/mp4': { max: 16000000, name: 'Video', caption: true },
    'video/3gpp': { max: 16000000, name: 'Video', caption: true },
    'text/plain': { max: 100000000, name: 'Documento', caption: true },
    'application/pdf': { max: 100000000, name: 'Documento', caption: true },
    'application/msword': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.ms-excel': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.ms-powerpoint': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.oasis.opendocument.text': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.oasis.opendocument.spreadsheet': { max: 100000000, name: 'Documento', caption: true },
    'application/vnd.oasis.opendocument.presentation': { max: 100000000, name: 'Documento', caption: true }
  };

  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'hidden';
  fileInput.accept = '.jpg,.jpeg,.png,.webp,.aac,.m4a,.mp3,.amr,.ogg,.mp4,.3gp,.txt,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp';
  fileInput.setAttribute('aria-label', 'Seleccionar archivo');

  var attachButton = document.createElement('button');
  attachButton.type = 'button';
  attachButton.className = 'secondary attach-button';
  attachButton.textContent = 'Adjuntar';
  attachButton.title = 'Enviar imagen, audio, video o documento';
  composer.classList.add('media-enabled');
  composer.insertBefore(attachButton, messageInput);
  composer.appendChild(fileInput);

  var overlay = document.createElement('div');
  overlay.className = 'media-modal hidden';
  overlay.innerHTML = '<div class="media-dialog" role="dialog" aria-modal="true" aria-labelledby="mediaTitle">' +
    '<div class="media-dialog-head"><div><h2 id="mediaTitle">Enviar archivo</h2><p id="mediaDescription"></p></div>' +
    '<button id="mediaClose" class="media-close" type="button" aria-label="Cerrar">×</button></div>' +
    '<div id="mediaPreview" class="media-preview"></div>' +
    '<label id="mediaCaptionField" class="media-caption-field">Mensaje opcional' +
    '<textarea id="mediaCaption" maxlength="1024" rows="3" placeholder="Escribí un texto para acompañar el archivo"></textarea></label>' +
    '<div id="mediaProgress" class="media-progress hidden">Subiendo y enviando…</div>' +
    '<div class="media-dialog-actions"><button id="mediaCancel" class="secondary" type="button">Cancelar</button>' +
    '<button id="mediaSend" class="primary" type="button">Enviar archivo</button></div></div>';
  document.body.appendChild(overlay);

  var mediaDescription = document.getElementById('mediaDescription');
  var mediaPreview = document.getElementById('mediaPreview');
  var captionField = document.getElementById('mediaCaptionField');
  var captionInput = document.getElementById('mediaCaption');
  var sendButton = document.getElementById('mediaSend');
  var cancelButton = document.getElementById('mediaCancel');
  var closeButton = document.getElementById('mediaClose');
  var progress = document.getElementById('mediaProgress');
  var selectedFile = null;
  var selectedMime = null;
  var previewUrl = null;

  function showToast(message, error) {
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.remove('hidden');
    window.setTimeout(function () { toast.classList.add('hidden'); }, 3500);
  }

  function selectedWaId() {
    var value = document.getElementById('contactPhone').textContent || '';
    return value.replace(/\D/g, '');
  }

  function detectMime(file) {
    if (file.type && rules[file.type.toLowerCase()]) return file.type.toLowerCase();
    var parts = file.name.toLowerCase().split('.');
    return mimeByExtension[parts.length > 1 ? parts.pop() : ''] || '';
  }

  function humanSize(bytes) {
    if (bytes < 1000000) return Math.ceil(bytes / 1000) + ' KB';
    return (bytes / 1000000).toFixed(bytes >= 10000000 ? 0 : 1) + ' MB';
  }

  function closeModal() {
    overlay.classList.add('hidden');
    progress.classList.add('hidden');
    sendButton.disabled = false;
    cancelButton.disabled = false;
    closeButton.disabled = false;
    captionInput.disabled = false;
    captionInput.value = '';
    mediaPreview.replaceChildren();
    selectedFile = null;
    selectedMime = null;
    fileInput.value = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function openModal(file, mime, rule) {
    selectedFile = file;
    selectedMime = mime;
    mediaDescription.textContent = rule.name + ' · ' + file.name + ' · ' + humanSize(file.size);
    captionField.classList.toggle('hidden', !rule.caption);
    mediaPreview.replaceChildren();
    if (mime.indexOf('image/') === 0 && mime !== 'image/webp') {
      previewUrl = URL.createObjectURL(file);
      var image = document.createElement('img');
      image.src = previewUrl;
      image.alt = file.name;
      mediaPreview.appendChild(image);
    } else if (mime.indexOf('video/') === 0) {
      previewUrl = URL.createObjectURL(file);
      var video = document.createElement('video');
      video.src = previewUrl;
      video.controls = true;
      video.preload = 'metadata';
      mediaPreview.appendChild(video);
    } else {
      var icon = document.createElement('div');
      icon.className = 'media-file-icon';
      icon.textContent = rule.name;
      mediaPreview.appendChild(icon);
    }
    overlay.classList.remove('hidden');
    if (rule.caption) captionInput.focus();
    else sendButton.focus();
  }

  attachButton.addEventListener('click', function () {
    if (!selectedWaId()) {
      showToast('Primero elegí una conversación.', true);
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var mime = detectMime(file);
    var rule = rules[mime];
    if (!rule) {
      showToast('Ese formato no está permitido por WhatsApp.', true);
      fileInput.value = '';
      return;
    }
    if (file.size <= 0) {
      showToast('El archivo está vacío.', true);
      fileInput.value = '';
      return;
    }
    if (file.size > rule.max) {
      showToast('El archivo supera el límite de ' + humanSize(rule.max) + '.', true);
      fileInput.value = '';
      return;
    }
    openModal(file, mime, rule);
  });

  async function sendSelectedFile() {
    var waId = selectedWaId();
    if (!selectedFile || !selectedMime || !waId) return;
    sendButton.disabled = true;
    cancelButton.disabled = true;
    closeButton.disabled = true;
    captionInput.disabled = true;
    progress.classList.remove('hidden');
    try {
      var response = await fetch('/admin/api/media/outbound/' + encodeURIComponent(waId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': selectedMime,
          'x-citycred-filename': encodeURIComponent(selectedFile.name),
          'x-citycred-caption': encodeURIComponent(captionField.classList.contains('hidden') ? '' : captionInput.value.trim())
        },
        body: selectedFile
      });
      if (response.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar el archivo.');
      var warning = data.warning;
      closeModal();
      showToast(warning || 'Archivo enviado.', Boolean(warning));
      var activeChat = document.querySelector('.chat-item.active');
      if (activeChat) activeChat.click();
    } catch (error) {
      progress.classList.add('hidden');
      sendButton.disabled = false;
      cancelButton.disabled = false;
      closeButton.disabled = false;
      captionInput.disabled = false;
      showToast(error.message || 'No se pudo enviar el archivo.', true);
    }
  }

  sendButton.addEventListener('click', sendSelectedFile);
  cancelButton.addEventListener('click', closeModal);
  closeButton.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay && !sendButton.disabled) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden') && !sendButton.disabled) {
      closeModal();
    }
  });
})();
`;
