const { MongoClient, ServerApiVersion } = require('mongodb');

// Se usan variables de entorno si existen. Si no, se usa la conexión integrada.
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://panel:imagenfekas@cluster0.mjwy0tl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGODB_DB = process.env.MONGODB_DB || 'GersonDB';

const globalCache = global.__panelMongoCache || (global.__panelMongoCache = {
  client: null,
  promise: null
});

async function getDatabase() {
  if (globalCache.client) {
    return globalCache.client.db(MONGODB_DB);
  }

  if (!globalCache.promise) {
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      },
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 12000,
      connectTimeoutMS: 12000
    });

    globalCache.promise = client.connect();
  }

  try {
    globalCache.client = await globalCache.promise;
    return globalCache.client.db(MONGODB_DB);
  } catch (error) {
    globalCache.promise = null;
    globalCache.client = null;
    throw error;
  }
}

module.exports = { getDatabase };
