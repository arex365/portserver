const { db, admin } = require('../firestore');

// connectDB is kept for compatibility with existing start-up flow
const connectDB = async () => {
  // Firestore initializes via `api/firestore.js`, so just return the db instance
  if (!db) throw new Error('Firestore not initialized');
  return db;
};

// Provide a DB-like interface used by existing code (only methods needed are implemented)
const getDB = () => {
  // To remain compatible with code that does `await db.listCollections().toArray()` (Mongo shape),
  // return an object with a `listCollections()` that exposes `toArray()` which returns an array of { name }
  return {
    listCollections: () => ({
      toArray: async () => {
        const cols = await db.listCollections();
        return cols.map((c) => ({ name: c.id }));
      },
    }),
  };
};

class FireCollection {
  constructor(colRef) {
    this.colRef = colRef;
  }

  // Count documents matching a filter (supports simple equality and $regex in-memory)
  async countDocuments(filter = {}) {
    const docs = await this._getMatchingDocs(filter);
    return docs.length;
  }

  // Insert a new document and return an object similar to Mongo's insertOne result
  async insertOne(doc) {
    const docRef = await this.colRef.add(doc);
    return { insertedId: docRef.id };
  }

  // Emulate Mongo's find(filter).sort(...).toArray()
  find(filter = {}) {
    const self = this;
    const state = { _sort: null };

    return {
      sort(sortObj) {
        state._sort = sortObj;
        return this;
      },
      async toArray() {
        const docs = await self._getMatchingDocs(filter);
        let arr = docs.map((d) => ({ ...d.data(), _id: d.id }));

        if (state._sort) {
          const [[field, order]] = Object.entries(state._sort);
          arr.sort((a, b) => {
            const av = a[field] ?? 0;
            const bv = b[field] ?? 0;
            if (av === bv) return 0;
            return order === -1 ? (bv > av ? 1 : -1) : av > bv ? 1 : -1;
          });
        }

        return arr;
      },
    };
  }

  // Convenience to get a single document
  async findOne(filter = {}) {
    const arr = await this.find(filter).toArray();
    return arr.length > 0 ? arr[0] : null;
  }

  // Update a single document matching the filter. Supports filter by _id and $set updates.
  async updateOne(filter = {}, updateObj = {}) {
    if (filter && filter._id) {
      const docRef = this.colRef.doc(String(filter._id));
      await docRef.update(updateObj.$set || updateObj);
      return { modifiedCount: 1 };
    }

    // Fallback: find first matching document and update
    const docs = await this._getMatchingDocs(filter);
    if (docs.length === 0) return { modifiedCount: 0 };
    await docs[0].ref.update(updateObj.$set || updateObj);
    return { modifiedCount: 1 };
  }

  // Delete a single document matching filter
  async deleteOne(filter = {}) {
    if (filter && filter._id) {
      await this.colRef.doc(String(filter._id)).delete();
      return { deletedCount: 1 };
    }

    const docs = await this._getMatchingDocs(filter);
    if (docs.length === 0) return { deletedCount: 0 };
    await docs[0].ref.delete();
    return { deletedCount: 1 };
  }

  // Delete many documents matching filter (batched commits)
  async deleteMany(filter = {}) {
    const docs = await this._getMatchingDocs(filter);
    if (docs.length === 0) return { deletedCount: 0 };

    const BATCH_SIZE = 500;
    let deletedCount = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = admin.firestore().batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deletedCount += chunk.length;
    }

    return { deletedCount };
  }

  // Helper: get DocumentSnapshots matching a filter (supports simple equality and in-memory regex)
  async _getMatchingDocs(filter = {}) {
    // If filter specifies an _id, fetch the doc directly (fast path)
    if (filter && filter._id) {
      const docSnap = await this.colRef.doc(String(filter._id)).get();
      if (!docSnap.exists) return [];
      const docObj = { id: docSnap.id, ref: docSnap.ref, data: () => docSnap.data() };

      // If there are additional constraints, verify them against the fetched doc
      for (const [k, v] of Object.entries(filter)) {
        if (k === '_id') continue;
        const val = docObj.data()[k];
        if (v && typeof v === 'object' && v.$regex) {
          const regex = new RegExp(v.$regex, v.$options || '');
          if (!regex.test(val)) return [];
        } else {
          if (val !== v) return [];
        }
      }

      return [docObj];
    }

    let query = this.colRef;
    const inMemoryChecks = [];

    if (filter && Object.keys(filter).length > 0) {
      for (const [k, v] of Object.entries(filter)) {
        if (v && typeof v === 'object' && v.$regex) {
          const regex = new RegExp(v.$regex, v.$options || '');
          inMemoryChecks.push((data) => regex.test(data[k]));
        } else {
          query = query.where(k, '==', v);
        }
      }
    }

    const snap = await query.get();
    let docs = snap.docs;

    if (inMemoryChecks.length > 0) {
      docs = docs.filter((d) => inMemoryChecks.every((fn) => fn(d.data())));
    }

    // Return objects with id, ref and data() to make calling code simple
    return docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: () => doc.data() }));
  }
}

const getCollection = (collectionName) => {
  if (!collectionName || typeof collectionName !== 'string') collectionName = 'positions';
  const colRef = db.collection(collectionName);
  return new FireCollection(colRef);
};

module.exports = {
  connectDB,
  getDB,
  getCollection,
};
