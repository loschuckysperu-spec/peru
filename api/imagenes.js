const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../lib/db');

// Credenciales privadas del servidor. Nunca se envían completas al navegador.
const CLOUDINARY = Object.freeze({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'glhzakbq',
  apiKey: process.env.CLOUDINARY_API_KEY || '657535249683599',
  apiSecret: process.env.CLOUDINARY_API_SECRET || 'mBuCKoPJV3Wh1qhxPqxwOAJmi4M'
});

const FOLDER = 'panel-imagenes';
const COLLECTION = 'imagenes';
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const url = new URL(req.url || '/', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function getBody(req) {
  if (!req.body) return {};
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (typeof req.body === 'object') return req.body;
  return {};
}

function cloudinarySignature(params) {
  const canonical = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${canonical}${CLOUDINARY.apiSecret}`)
    .digest('hex');
}

function validateCredentials() {
  if (!CLOUDINARY.cloudName || !CLOUDINARY.apiKey || !CLOUDINARY.apiSecret) {
    throw new Error('Faltan las credenciales privadas de Cloudinary.');
  }
}

function normalizeImage(value) {
  if (!value || typeof value !== 'object') return null;

  const url = String(value.url || value.secure_url || '').trim();
  const publicId = String(value.publicId || value.public_id || '').trim();
  const format = String(value.format || '').trim().toLowerCase();
  const width = Number(value.width);
  const height = Number(value.height);
  const bytes = Number(value.bytes);

  if (!url.startsWith(`https://res.cloudinary.com/${CLOUDINARY.cloudName}/`)) {
    throw new Error('La imagen no pertenece al Cloudinary configurado.');
  }
  if (!publicId.startsWith(`${FOLDER}/`)) {
    throw new Error('La imagen no pertenece a la carpeta permitida.');
  }
  if (format && !ALLOWED_FORMATS.has(format)) {
    throw new Error('El formato de imagen no está permitido.');
  }
  if (Number.isFinite(bytes) && bytes > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 12 MB.');
  }

  return {
    url,
    publicId,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    format: format || null,
    bytes: Number.isFinite(bytes) ? bytes : null
  };
}

function serializeRecord(record) {
  return {
    _id: record._id.toString(),
    imagen1: record.imagen1,
    imagen2: record.imagen2,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function destroyImage(publicId) {
  if (!publicId) return { result: 'not_found' };

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    invalidate: 'true',
    public_id: publicId,
    timestamp
  };
  const body = new URLSearchParams({
    ...paramsToSign,
    api_key: CLOUDINARY.apiKey,
    signature: cloudinarySignature(paramsToSign)
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY.cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.result !== 'ok' && data.result !== 'not found')) {
    throw new Error(data.error?.message || 'Cloudinary no pudo borrar la imagen.');
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Allow', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    validateCredentials();
    const query = getQuery(req);
    const action = String(query.action || '');

    if (req.method === 'POST' && action === 'firma') {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        folder: FOLDER,
        overwrite: 'false',
        timestamp,
        unique_filename: 'true'
      };

      return sendJson(res, 200, {
        ok: true,
        uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`,
        apiKey: CLOUDINARY.apiKey,
        signature: cloudinarySignature(params),
        params,
        maxBytes: MAX_BYTES
      });
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const records = await collection.find({}).sort({ createdAt: -1 }).toArray();
      return sendJson(res, 200, {
        ok: true,
        total: records.length,
        imagenes: records.map(serializeRecord)
      });
    }

    if (req.method === 'POST') {
      const body = getBody(req);
      const imagen1 = normalizeImage(body.imagen1);
      const imagen2 = normalizeImage(body.imagen2);

      if (!imagen1 || !imagen2) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Debes enviar exactamente imagen1 e imagen2.'
        });
      }

      const now = new Date();
      const document = { imagen1, imagen2, createdAt: now, updatedAt: now };

      try {
        const result = await collection.insertOne(document);
        document._id = result.insertedId;
        return sendJson(res, 201, {
          ok: true,
          mensaje: 'Las dos imágenes se guardaron correctamente.',
          imagen: serializeRecord(document)
        });
      } catch (error) {
        await Promise.allSettled([
          destroyImage(imagen1.publicId),
          destroyImage(imagen2.publicId)
        ]);
        throw error;
      }
    }

    if (req.method === 'PUT') {
      const id = String(query.id || '');
      if (!ObjectId.isValid(id)) {
        return sendJson(res, 400, { ok: false, error: 'El ID no es válido.' });
      }

      const body = getBody(req);
      const imagen1Nueva = body.imagen1 ? normalizeImage(body.imagen1) : null;
      const imagen2Nueva = body.imagen2 ? normalizeImage(body.imagen2) : null;

      if (!imagen1Nueva && !imagen2Nueva) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Selecciona al menos una imagen para reemplazar.'
        });
      }

      const objectId = new ObjectId(id);
      const previous = await collection.findOne({ _id: objectId });
      if (!previous) {
        await Promise.allSettled([
          imagen1Nueva ? destroyImage(imagen1Nueva.publicId) : Promise.resolve(),
          imagen2Nueva ? destroyImage(imagen2Nueva.publicId) : Promise.resolve()
        ]);
        return sendJson(res, 404, { ok: false, error: 'El registro no existe.' });
      }

      const updates = { updatedAt: new Date() };
      if (imagen1Nueva) updates.imagen1 = imagen1Nueva;
      if (imagen2Nueva) updates.imagen2 = imagen2Nueva;

      let updated;
      try {
        updated = await collection.findOneAndUpdate(
          { _id: objectId },
          { $set: updates },
          { returnDocument: 'after' }
        );
      } catch (error) {
        await Promise.allSettled([
          imagen1Nueva ? destroyImage(imagen1Nueva.publicId) : Promise.resolve(),
          imagen2Nueva ? destroyImage(imagen2Nueva.publicId) : Promise.resolve()
        ]);
        throw error;
      }

      if (!updated) {
        return sendJson(res, 404, { ok: false, error: 'El registro no existe.' });
      }

      const oldPublicIds = [];
      if (imagen1Nueva) oldPublicIds.push(previous.imagen1.publicId);
      if (imagen2Nueva) oldPublicIds.push(previous.imagen2.publicId);
      const cleanup = await Promise.allSettled(oldPublicIds.map(destroyImage));

      return sendJson(res, 200, {
        ok: true,
        mensaje: 'Las imágenes fueron reemplazadas correctamente.',
        advertencias: cleanup.filter((item) => item.status === 'rejected').length,
        imagen: serializeRecord(updated)
      });
    }

    if (req.method === 'DELETE') {
      const id = String(query.id || '');
      if (!ObjectId.isValid(id)) {
        return sendJson(res, 400, { ok: false, error: 'El ID no es válido.' });
      }

      const removed = await collection.findOneAndDelete({ _id: new ObjectId(id) });
      if (!removed) {
        return sendJson(res, 404, { ok: false, error: 'El registro no existe.' });
      }

      const cleanup = await Promise.allSettled([
        destroyImage(removed.imagen1.publicId),
        destroyImage(removed.imagen2.publicId)
      ]);

      return sendJson(res, 200, {
        ok: true,
        mensaje: 'El registro se eliminó del panel, MongoDB y Cloudinary.',
        advertencias: cleanup.filter((item) => item.status === 'rejected').length
      });
    }

    return sendJson(res, 405, { ok: false, error: 'Método no permitido.' });
  } catch (error) {
    console.error('Error en /api/imagenes:', error);
    const knownMongoNetwork = /server selection|timed out|ENOTFOUND|ECONNREFUSED|IP that isn't whitelisted/i.test(error.message || '');
    return sendJson(res, 500, {
      ok: false,
      error: knownMongoNetwork
        ? 'MongoDB no permitió la conexión. Revisa Network Access en Atlas.'
        : 'No se pudo completar la operación.',
      detalle: error.message || 'Error desconocido'
    });
  }
};
