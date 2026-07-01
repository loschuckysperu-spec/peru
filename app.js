const API_URL = "https://peru-tan.vercel.app/api/imagenes";

const state = {
  records: [],
  filtered: [],
  editing: null,
  deleting: null,
  sortAsc: false
};

const $ = (selector) => document.querySelector(selector);

const recordsGrid = $("#records-grid");
const totalCount = $("#total-count");
const connectionPill = $("#connection-pill");
const connectionLabel = $("#connection-label");
const editorModal = $("#editor-modal");
const deleteModal = $("#delete-modal");
const form = $("#image-form");
const image1 = $("#image-1");
const image2 = $("#image-2");
const searchPanel = $("#search-panel");
const searchInput = $("#search-input");

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadRecords();
});

function bindEvents() {
  $("#new-button").addEventListener("click", openCreateModal);
  $("#close-editor").addEventListener("click", closeEditor);
  $("#cancel-edit").addEventListener("click", closeEditor);
  $("#search-button").addEventListener("click", () => {
    searchPanel.classList.toggle("hidden");
    if (!searchPanel.classList.contains("hidden")) searchInput.focus();
  });
  $("#clear-search").addEventListener("click", () => {
    searchInput.value = "";
    filterRecords("");
  });
  searchInput.addEventListener("input", (event) => filterRecords(event.target.value));
  $("#sort-button").addEventListener("click", sortRecords);
  image1.addEventListener("change", () => previewFile(image1, 1));
  image2.addEventListener("change", () => previewFile(image2, 2));
  form.addEventListener("submit", saveRecord);
  $("#delete-cancel").addEventListener("click", closeDelete);
  $("#delete-confirm").addEventListener("click", confirmDelete);

  editorModal.addEventListener("click", (event) => {
    if (event.target === editorModal) closeEditor();
  });

  deleteModal.addEventListener("click", (event) => {
    if (event.target === deleteModal) closeDelete();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEditor();
      closeDelete();
    }
  });
}

async function loadRecords() {
  recordsGrid.innerHTML = loadingMarkup("Cargando colección…");

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data?.mensaje || data?.message || "No se pudo cargar la colección.");
    }

    const list = Array.isArray(data) ? data : (data.imagenes || data.data || []);
    state.records = Array.isArray(list) ? list : [];
    state.filtered = [...state.records];

    setConnection(true);
    renderRecords();
  } catch (error) {
    console.error(error);
    setConnection(false);
    recordsGrid.innerHTML = `
      <div class="error-state">
        <span>No se pudo conectar con la API.</span>
        <button class="action-button" type="button" onclick="loadRecords()">Reintentar</button>
      </div>`;
  }
}

function renderRecords() {
  totalCount.textContent = state.filtered.length;

  if (!state.filtered.length) {
    recordsGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true"></span>
        <span>No hay colecciones</span>
      </div>`;
    return;
  }

  recordsGrid.innerHTML = state.filtered.map((record, index) => {
    const id = record._id || record.id || "";
    const first = imageUrl(record.imagen1 || record.image1);
    const second = imageUrl(record.imagen2 || record.image2);
    const title = record.titulo || record.title || `Par de imágenes ${index + 1}`;
    const slug = record.slug || String(id);
    const created = record.createdAt ? new Date(record.createdAt).toLocaleDateString("es-PE") : "Registro guardado";

    return `
      <article class="record-row" data-id="${escapeHtml(id)}">
        <div class="pair-thumbnails">
          <img src="${escapeHtml(first)}" alt="Imagen 1" loading="lazy">
          <img src="${escapeHtml(second)}" alt="Imagen 2" loading="lazy">
        </div>

        <div class="record-title">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(created)}</small>
        </div>

        <div class="slug" title="${escapeHtml(slug)}">${escapeHtml(slug)}</div>

        <div><span class="status-active">Activo</span></div>

        <div class="row-actions">
          <button class="action-button" type="button" onclick="editRecord('${escapeJs(id)}')">Editar</button>
          <button class="action-button delete" type="button" onclick="askDelete('${escapeJs(id)}')">Eliminar</button>
        </div>
      </article>`;
  }).join("");
}

function filterRecords(query) {
  const normalized = query.trim().toLowerCase();

  state.filtered = !normalized
    ? [...state.records]
    : state.records.filter((record, index) => {
        const id = record._id || record.id || "";
        const title = record.titulo || record.title || `Par de imágenes ${index + 1}`;
        const slug = record.slug || id;
        return `${title} ${slug} ${id}`.toLowerCase().includes(normalized);
      });

  renderRecords();
}

function sortRecords() {
  state.sortAsc = !state.sortAsc;
  state.filtered.sort((a, b) => {
    const aValue = new Date(a.createdAt || 0).getTime();
    const bValue = new Date(b.createdAt || 0).getTime();
    return state.sortAsc ? aValue - bValue : bValue - aValue;
  });
  renderRecords();
}

function openCreateModal() {
  state.editing = null;
  resetForm();
  $("#editor-eyebrow").textContent = "NUEVO REGISTRO";
  $("#editor-title").textContent = "Agregar dos imágenes";
  $("#editor-description").textContent = "Selecciona la imagen 1 y la imagen 2.";
  $("#form-hint").textContent = "Las dos imágenes son obligatorias al crear.";
  $("#save-label").textContent = "Guardar";
  editorModal.classList.remove("hidden");
}

function editRecord(id) {
  const record = state.records.find((item) => String(item._id || item.id) === String(id));
  if (!record) return;

  state.editing = record;
  resetForm();

  $("#editing-id").value = id;
  $("#editor-eyebrow").textContent = "EDITAR REGISTRO";
  $("#editor-title").textContent = "Editar par de imágenes";
  $("#editor-description").textContent = "Puedes reemplazar una o las dos imágenes.";
  $("#form-hint").textContent = "Deja un campo sin cambiar para conservar la imagen actual.";
  $("#save-label").textContent = "Guardar cambios";

  showExistingPreview(imageUrl(record.imagen1 || record.image1), 1);
  showExistingPreview(imageUrl(record.imagen2 || record.image2), 2);
  editorModal.classList.remove("hidden");
}

function closeEditor() {
  editorModal.classList.add("hidden");
  resetForm();
  state.editing = null;
}

function resetForm() {
  form.reset();
  $("#editing-id").value = "";

  [1, 2].forEach((number) => {
    $(`#empty-${number}`).classList.remove("hidden");
    $(`#preview-wrap-${number}`).classList.add("hidden");
    $(`#preview-${number}`).removeAttribute("src");
  });
}

function previewFile(input, number) {
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Selecciona un archivo de imagen válido.", "error");
    input.value = "";
    return;
  }

  if (file.size > 12 * 1024 * 1024) {
    showToast("La imagen supera los 12 MB.", "error");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => showExistingPreview(reader.result, number);
  reader.readAsDataURL(file);
}

function showExistingPreview(url, number) {
  $(`#preview-${number}`).src = url;
  $(`#empty-${number}`).classList.add("hidden");
  $(`#preview-wrap-${number}`).classList.remove("hidden");
}

async function saveRecord(event) {
  event.preventDefault();

  const editing = Boolean(state.editing);
  const file1 = image1.files?.[0];
  const file2 = image2.files?.[0];

  if (!editing && (!file1 || !file2)) {
    showToast("Debes seleccionar las dos imágenes.", "error");
    return;
  }

  if (editing && !file1 && !file2) {
    showToast("Selecciona al menos una imagen para reemplazar.", "error");
    return;
  }

  const saveButton = $("#save-button");
  const originalLabel = $("#save-label").textContent;
  saveButton.disabled = true;
  $("#save-label").textContent = editing ? "Actualizando…" : "Guardando…";

  try {
    let response;

    if (editing) {
      const id = state.editing._id || state.editing.id;
      response = await sendUpdate(id, file1, file2);
    } else {
      const body = buildFormData(file1, file2);
      response = await fetch(API_URL, {
        method: "POST",
        body
      });
    }

    const data = await readJson(response);
    if (!response.ok) {
      throw new Error(data?.mensaje || data?.message || "No se pudo guardar.");
    }

    showToast(editing ? "Registro actualizado." : "Registro creado.", "success");
    closeEditor();
    await loadRecords();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Ocurrió un error al guardar.", "error");
  } finally {
    saveButton.disabled = false;
    $("#save-label").textContent = originalLabel;
  }
}

function buildFormData(file1, file2) {
  const data = new FormData();
  if (file1) data.append("imagen1", file1);
  if (file2) data.append("imagen2", file2);
  return data;
}

async function sendUpdate(id, file1, file2) {
  const url = `${API_URL}/${encodeURIComponent(id)}`;

  let response = await fetch(url, {
    method: "PUT",
    body: buildFormData(file1, file2)
  });

  if (response.status === 404 || response.status === 405) {
    response = await fetch(url, {
      method: "PATCH",
      body: buildFormData(file1, file2)
    });
  }

  return response;
}

function askDelete(id) {
  state.deleting = id;
  deleteModal.classList.remove("hidden");
}

function closeDelete() {
  state.deleting = null;
  deleteModal.classList.add("hidden");
}

async function confirmDelete() {
  if (!state.deleting) return;

  const button = $("#delete-confirm");
  button.disabled = true;
  button.textContent = "Eliminando…";

  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(state.deleting)}`, {
      method: "DELETE"
    });
    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(data?.mensaje || data?.message || "No se pudo eliminar.");
    }

    showToast("Registro eliminado.", "success");
    closeDelete();
    await loadRecords();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Ocurrió un error al eliminar.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Sí, eliminar";
  }
}

function imageUrl(value) {
  if (!value) return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="#111216"/>
      <text x="50%" y="50%" fill="#777b86" font-family="Arial" font-size="16" text-anchor="middle">Sin imagen</text>
    </svg>`
  );
  return typeof value === "string" ? value : (value.url || value.secure_url || "");
}

function setConnection(online) {
  connectionPill.classList.toggle("online", online);
  connectionPill.classList.toggle("offline", !online);
  connectionLabel.textContent = online ? "API conectada" : "API desconectada";
}

function showToast(message, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toast-stack").appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

function loadingMarkup(text) {
  return `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

window.editRecord = editRecord;
window.askDelete = askDelete;
window.loadRecords = loadRecords;
