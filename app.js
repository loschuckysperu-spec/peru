const API_URL = "https://peru-tan.vercel.app/api/imagenes";
const MAX_FILE_BYTES = 12 * 1024 * 1024;

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

  searchInput.addEventListener("input", (event) => {
    filterRecords(event.target.value);
  });

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
    const response = await fetch(API_URL, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    const data = await readJson(response);

    if (!response.ok || data.ok === false) {
      throw new Error(getApiError(data, "No se pudo cargar la colección."));
    }

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.imagenes)
        ? data.imagenes
        : [];

    state.records = list;
    state.filtered = [...list];

    setConnection(true);
    renderRecords();
  } catch (error) {
    console.error("Error al cargar:", error);
    setConnection(false);
    recordsGrid.innerHTML = `
      <div class="error-state">
        <span>${escapeHtml(error.message || "No se pudo conectar con la API.")}</span>
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
    const id = String(record._id || record.id || "");
    const first = imageUrl(record.imagen1 || record.image1);
    const second = imageUrl(record.imagen2 || record.image2);
    const title = record.titulo || record.title || `Par de imágenes ${index + 1}`;
    const slug = record.slug || id;
    const created = record.createdAt
      ? new Date(record.createdAt).toLocaleDateString("es-PE")
      : "Registro guardado";

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
          <button class="action-button" type="button"
            onclick="editRecord('${escapeJs(id)}')">Editar</button>
          <button class="action-button delete" type="button"
            onclick="askDelete('${escapeJs(id)}')">Eliminar</button>
        </div>
      </article>`;
  }).join("");
}

function filterRecords(query) {
  const normalized = query.trim().toLowerCase();

  state.filtered = !normalized
    ? [...state.records]
    : state.records.filter((record, index) => {
        const id = String(record._id || record.id || "");
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
  const record = state.records.find(
    (item) => String(item._id || item.id) === String(id)
  );

  if (!record) {
    showToast("No se encontró el registro.", "error");
    return;
  }

  state.editing = record;
  resetForm();

  $("#editing-id").value = id;
  $("#editor-eyebrow").textContent = "EDITAR REGISTRO";
  $("#editor-title").textContent = "Editar par de imágenes";
  $("#editor-description").textContent = "Puedes reemplazar una o las dos imágenes.";
  $("#form-hint").textContent = "Deja una imagen sin cambiar para conservar la actual.";
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

  const validationError = validateFile(file);
  if (validationError) {
    showToast(validationError, "error");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => showExistingPreview(reader.result, number);
  reader.onerror = () => showToast("No se pudo leer la imagen.", "error");
  reader.readAsDataURL(file);
}

function validateFile(file) {
  if (!file.type.startsWith("image/")) {
    return "Selecciona un archivo de imagen válido.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "La imagen supera el máximo de 12 MB.";
  }

  return "";
}

function showExistingPreview(url, number) {
  $(`#preview-${number}`).src = url;
  $(`#empty-${number}`).classList.add("hidden");
  $(`#preview-wrap-${number}`).classList.remove("hidden");
}

/*
  FLUJO CORRECTO:
  1. Se pide una firma privada a /api/imagenes?action=firma.
  2. El navegador sube cada archivo directamente a Cloudinary.
  3. Se envían a MongoDB solamente los datos devueltos por Cloudinary.
*/
async function saveRecord(event) {
  event.preventDefault();

  const editing = Boolean(state.editing);
  const file1 = image1.files?.[0] || null;
  const file2 = image2.files?.[0] || null;

  if (!editing && (!file1 || !file2)) {
    showToast("Debes seleccionar las dos imágenes.", "error");
    return;
  }

  if (editing && !file1 && !file2) {
    showToast("Selecciona al menos una imagen para reemplazar.", "error");
    return;
  }

  for (const file of [file1, file2].filter(Boolean)) {
    const validationError = validateFile(file);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }
  }

  const saveButton = $("#save-button");
  const originalLabel = editing ? "Guardar cambios" : "Guardar";

  saveButton.disabled = true;

  try {
    const body = {};

    if (file1) {
      $("#save-label").textContent = "Subiendo imagen 1…";
      body.imagen1 = await uploadImageToCloudinary(file1);
    }

    if (file2) {
      $("#save-label").textContent = "Subiendo imagen 2…";
      body.imagen2 = await uploadImageToCloudinary(file2);
    }

    $("#save-label").textContent = editing
      ? "Actualizando registro…"
      : "Guardando registro…";

    const response = editing
      ? await updateRecord(state.editing._id || state.editing.id, body)
      : await createRecord(body);

    const data = await readJson(response);

    if (!response.ok || data.ok === false) {
      throw new Error(getApiError(data, "No se pudo guardar."));
    }

    showToast(
      data.mensaje || (editing ? "Registro actualizado." : "Registro creado."),
      "success"
    );

    closeEditor();
    await loadRecords();
  } catch (error) {
    console.error("Error al guardar:", error);
    showToast(error.message || "No se pudo guardar.", "error");
  } finally {
    saveButton.disabled = false;
    $("#save-label").textContent = originalLabel;
  }
}

async function requestUploadSignature() {
  const response = await fetch(`${API_URL}?action=firma`, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  const data = await readJson(response);

  if (!response.ok || data.ok === false) {
    throw new Error(getApiError(data, "No se pudo preparar la subida."));
  }

  if (!data.uploadUrl || !data.apiKey || !data.signature || !data.params) {
    throw new Error("La API no devolvió una firma válida de Cloudinary.");
  }

  return data;
}

async function uploadImageToCloudinary(file) {
  const signed = await requestUploadSignature();
  const formData = new FormData();

  formData.append("file", file);
  formData.append("api_key", signed.apiKey);
  formData.append("signature", signed.signature);

  Object.entries(signed.params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value));
    }
  });

  const response = await fetch(signed.uploadUrl, {
    method: "POST",
    body: formData
  });

  const data = await readJson(response);

  if (!response.ok || data.error) {
    const cloudinaryMessage =
      data?.error?.message ||
      data?.message ||
      "Cloudinary no pudo subir la imagen.";

    throw new Error(cloudinaryMessage);
  }

  if (!data.secure_url || !data.public_id) {
    throw new Error("Cloudinary no devolvió los datos completos de la imagen.");
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: Number.isFinite(Number(data.width)) ? Number(data.width) : null,
    height: Number.isFinite(Number(data.height)) ? Number(data.height) : null,
    format: data.format || null,
    bytes: Number.isFinite(Number(data.bytes)) ? Number(data.bytes) : null
  };
}

function createRecord(body) {
  return fetch(API_URL, {
    method: "POST",
    mode: "cors",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function updateRecord(id, body) {
  return fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    mode: "cors",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
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
    const response = await fetch(
      `${API_URL}?id=${encodeURIComponent(state.deleting)}`,
      {
        method: "DELETE",
        mode: "cors",
        headers: { Accept: "application/json" }
      }
    );

    const data = await readJson(response);

    if (!response.ok || data.ok === false) {
      throw new Error(getApiError(data, "No se pudo eliminar."));
    }

    showToast(data.mensaje || "Registro eliminado.", "success");
    closeDelete();
    await loadRecords();
  } catch (error) {
    console.error("Error al eliminar:", error);
    showToast(error.message || "No se pudo eliminar.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Sí, eliminar";
  }
}

function imageUrl(value) {
  if (!value) {
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect width="100%" height="100%" fill="#111216"/>
        <text x="50%" y="50%" fill="#777b86" font-family="Arial"
          font-size="16" text-anchor="middle">Sin imagen</text>
      </svg>`
    );
  }

  return typeof value === "string"
    ? value
    : (value.url || value.secure_url || "");
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

  setTimeout(() => toast.remove(), 5000);
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

function getApiError(data, fallback) {
  const main =
    data?.error?.message ||
    data?.error ||
    data?.mensaje ||
    data?.message ||
    fallback;

  const detail = data?.detalle;

  if (detail && detail !== main) {
    return `${main} — ${detail}`;
  }

  return String(main || fallback);
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
