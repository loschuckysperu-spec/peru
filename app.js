const API_URL = '/api/imagenes';
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

const state = {
  registros: [],
  files: { 1: null, 2: null },
  editing: null,
  pendingDeleteId: null
};

const elements = {
  form: document.getElementById('image-form'),
  editorCard: document.getElementById('editor-card'),
  editorEyebrow: document.getElementById('editor-eyebrow'),
  editorTitle: document.getElementById('editor-title'),
  editorDescription: document.getElementById('editor-description'),
  editingId: document.getElementById('editing-id'),
  cancelEdit: document.getElementById('cancel-edit'),
  formHint: document.getElementById('form-hint'),
  saveButton: document.getElementById('save-button'),
  saveLabel: document.getElementById('save-label'),
  totalCount: document.getElementById('total-count'),
  recordsGrid: document.getElementById('records-grid'),
  refreshButton: document.getElementById('refresh-button'),
  connectionPill: document.getElementById('connection-pill'),
  connectionLabel: document.getElementById('connection-label'),
  deleteModal: document.getElementById('delete-modal'),
  deleteCancel: document.getElementById('delete-cancel'),
  deleteConfirm: document.getElementById('delete-confirm'),
  toastStack: document.getElementById('toast-stack')
};

function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.innerHTML = `
    <span class="toast-dot"></span>
    <div><strong></strong><span></span></div>
  `;
  toast.querySelector('strong').textContent = title;
  toast.querySelector('span:last-child').textContent = message;
  elements.toastStack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function setConnection(online, label) {
  elements.connectionPill.classList.remove('online', 'offline');
  elements.connectionPill.classList.add(online ? 'online' : 'offline');
  elements.connectionLabel.textContent = label;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'La API devolvió un error.');
  }
  return data;
}

function validateFile(file) {
  if (!file) return;
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Formato no permitido. Usa JPG, PNG, WEBP, AVIF o GIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 12 MB.');
  }
}

function setPreview(slot, source, isObjectUrl = false) {
  const empty = document.getElementById(`empty-${slot}`);
  const wrap = document.getElementById(`preview-wrap-${slot}`);
  const img = document.getElementById(`preview-${slot}`);

  if (img.dataset.objectUrl) {
    URL.revokeObjectURL(img.dataset.objectUrl);
    delete img.dataset.objectUrl;
  }

  if (!source) {
    img.removeAttribute('src');
    empty.classList.remove('hidden');
    wrap.classList.add('hidden');
    return;
  }

  img.src = source;
  if (isObjectUrl) img.dataset.objectUrl = source;
  empty.classList.add('hidden');
  wrap.classList.remove('hidden');
}

function selectFile(slot, file) {
  try {
    validateFile(file);
    state.files[slot] = file;
    setPreview(slot, URL.createObjectURL(file), true);
  } catch (error) {
    showToast('Imagen no válida', error.message, 'error');
    document.getElementById(`image-${slot}`).value = '';
  }
}

[1, 2].forEach((slot) => {
  const input = document.getElementById(`image-${slot}`);
  const drop = document.getElementById(`drop-${slot}`);

  input.addEventListener('change', () => selectFile(slot, input.files?.[0]));

  ['dragenter', 'dragover'].forEach((eventName) => {
    drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      drop.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    drop.addEventListener(eventName, (event) => {
      event.preventDefault();
      drop.classList.remove('dragging');
    });
  });

  drop.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) selectFile(slot, file);
  });
});

function renderLoading() {
  elements.recordsGrid.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(dateValue));
}

function renderRecords() {
  elements.totalCount.textContent = String(state.registros.length);
  elements.recordsGrid.innerHTML = '';

  if (!state.registros.length) {
    elements.recordsGrid.innerHTML = `
      <div class="state-card">
        <div><strong>Aún no hay imágenes</strong><span>Sube tu primer par desde el formulario superior.</span></div>
      </div>
    `;
    return;
  }

  state.registros.forEach((registro, index) => {
    const card = document.createElement('article');
    card.className = 'record-card';
    card.style.animationDelay = `${Math.min(index, 8) * 45}ms`;
    card.innerHTML = `
      <div class="record-images">
        <a class="record-image" href="${registro.imagen1.url}" target="_blank" rel="noopener noreferrer">
          <img src="${registro.imagen1.url}" alt="Imagen 1 del registro" loading="lazy">
          <span class="image-number">IMAGEN 1</span>
        </a>
        <a class="record-image" href="${registro.imagen2.url}" target="_blank" rel="noopener noreferrer">
          <img src="${registro.imagen2.url}" alt="Imagen 2 del registro" loading="lazy">
          <span class="image-number">IMAGEN 2</span>
        </a>
      </div>
      <div class="record-footer">
        <div class="record-meta">
          <strong>Par ${state.registros.length - index}</strong>
          <span>${formatDate(registro.createdAt)}</span>
        </div>
        <div class="record-actions">
          <button class="icon-button edit-button" type="button" title="Editar o reemplazar imágenes" aria-label="Editar imágenes">
            <svg viewBox="0 0 24 24"><path d="m4 16.5-.7 4.2 4.2-.7L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/></svg>
          </button>
          <button class="icon-button danger delete-button" type="button" title="Eliminar par" aria-label="Eliminar par">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('.edit-button').addEventListener('click', () => startEditing(registro));
    card.querySelector('.delete-button').addEventListener('click', () => openDeleteModal(registro._id));
    elements.recordsGrid.appendChild(card);
  });
}

async function loadRecords(showSkeleton = true) {
  if (showSkeleton) renderLoading();
  try {
    const data = await apiRequest(API_URL);
    state.registros = data.imagenes || [];
    renderRecords();
    setConnection(true, 'API conectada');
  } catch (error) {
    state.registros = [];
    elements.totalCount.textContent = '0';
    elements.recordsGrid.innerHTML = `
      <div class="state-card">
        <div><strong>No se pudo conectar</strong><span>${escapeHtml(error.message)}</span></div>
      </div>
    `;
    setConnection(false, 'Sin conexión');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function uploadToCloudinary(file) {
  const signature = await apiRequest(`${API_URL}?action=firma`, {
    method: 'POST',
    body: JSON.stringify({})
  });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('signature', signature.signature);
  Object.entries(signature.params).forEach(([key, value]) => form.append(key, String(value)));

  const response = await fetch(signature.uploadUrl, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || 'Cloudinary rechazó la imagen.');
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes
  };
}

function setSaving(saving, label = 'Guardando…') {
  elements.saveButton.disabled = saving;
  if (saving) {
    elements.saveButton.innerHTML = `<span class="spinner"></span><span>${label}</span>`;
  } else {
    elements.saveButton.innerHTML = `
      <span id="save-label">${state.editing ? 'Guardar reemplazos' : 'Guardar par de imágenes'}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 2.6 2.6L16.5 8.7"/><circle cx="12" cy="12" r="9"/></svg>
    `;
    elements.saveLabel = document.getElementById('save-label');
  }
}

async function submitForm(event) {
  event.preventDefault();

  const editing = Boolean(state.editing);
  if (!editing && (!state.files[1] || !state.files[2])) {
    showToast('Faltan imágenes', 'Debes seleccionar la imagen 1 y la imagen 2.', 'error');
    return;
  }
  if (editing && !state.files[1] && !state.files[2]) {
    showToast('Nada para actualizar', 'Selecciona al menos una imagen nueva.', 'error');
    return;
  }

  setSaving(true, editing ? 'Reemplazando…' : 'Subiendo…');

  try {
    const payload = {};
    if (state.files[1]) payload.imagen1 = await uploadToCloudinary(state.files[1]);
    if (state.files[2]) payload.imagen2 = await uploadToCloudinary(state.files[2]);

    if (editing) {
      await apiRequest(`${API_URL}?id=${encodeURIComponent(state.editing._id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Registro actualizado', 'Las imágenes seleccionadas fueron reemplazadas.', 'success');
    } else {
      await apiRequest(API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Par guardado', 'Las dos imágenes ya están en Cloudinary y MongoDB.', 'success');
    }

    resetEditor();
    await loadRecords(false);
  } catch (error) {
    showToast('No se pudo guardar', error.message, 'error');
  } finally {
    setSaving(false);
  }
}

function startEditing(registro) {
  state.editing = registro;
  state.files[1] = null;
  state.files[2] = null;
  elements.editingId.value = registro._id;
  elements.editorCard.classList.add('editing');
  elements.editorEyebrow.textContent = 'EDITANDO REGISTRO';
  elements.editorTitle.textContent = 'Reemplazar imágenes';
  elements.editorDescription.textContent = 'Selecciona una o las dos imágenes. La que no cambies se conservará.';
  elements.formHint.textContent = 'Puedes reemplazar solo una imagen o reemplazar las dos.';
  elements.cancelEdit.classList.remove('hidden');
  elements.saveLabel.textContent = 'Guardar reemplazos';
  document.getElementById('image-1').value = '';
  document.getElementById('image-2').value = '';
  setPreview(1, registro.imagen1.url);
  setPreview(2, registro.imagen2.url);
  elements.editorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetEditor() {
  state.editing = null;
  state.files[1] = null;
  state.files[2] = null;
  elements.form.reset();
  elements.editingId.value = '';
  elements.editorCard.classList.remove('editing');
  elements.editorEyebrow.textContent = 'NUEVO REGISTRO';
  elements.editorTitle.textContent = 'Agregar dos imágenes';
  elements.editorDescription.textContent = 'Las dos imágenes son obligatorias al crear un registro.';
  elements.formHint.textContent = 'Al guardar se creará un registro con exactamente dos imágenes.';
  elements.cancelEdit.classList.add('hidden');
  setPreview(1, null);
  setPreview(2, null);
  setSaving(false);
}

function openDeleteModal(id) {
  state.pendingDeleteId = id;
  elements.deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  elements.deleteModal.classList.add('hidden');
}

async function confirmDelete() {
  if (!state.pendingDeleteId) return;
  const id = state.pendingDeleteId;
  elements.deleteConfirm.disabled = true;
  elements.deleteConfirm.innerHTML = '<span class="spinner"></span>Eliminando…';

  try {
    await apiRequest(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Registro eliminado', 'Se borraron las dos imágenes y el registro.', 'success');
    if (state.editing?._id === id) resetEditor();
    closeDeleteModal();
    await loadRecords(false);
  } catch (error) {
    showToast('No se pudo eliminar', error.message, 'error');
  } finally {
    elements.deleteConfirm.disabled = false;
    elements.deleteConfirm.textContent = 'Sí, eliminar';
  }
}

elements.form.addEventListener('submit', submitForm);
elements.cancelEdit.addEventListener('click', resetEditor);
elements.refreshButton.addEventListener('click', () => loadRecords(true));
elements.deleteCancel.addEventListener('click', closeDeleteModal);
elements.deleteConfirm.addEventListener('click', confirmDelete);
elements.deleteModal.addEventListener('click', (event) => {
  if (event.target === elements.deleteModal) closeDeleteModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.deleteModal.classList.contains('hidden')) closeDeleteModal();
});

loadRecords(true);
