import mongoose from 'mongoose'

// Query-operator injection ({ "$gt": "" }) is prevented at the boundary: every
// request body is parsed by a strict zod schema that only admits primitive
// strings/booleans, so no user-controlled object reaches a query filter.
mongoose.set('strictQuery', true)
mongoose.set('autoIndex', true)

/**
 * Connects to MongoDB. Signup and password reset use multi-document
 * transactions, so the deployment must be a replica set (MongoDB Atlas is;
 * the local docker-compose runs a single-node replica set).
 */
export async function connectDatabase(uri, logger) {
  mongoose.connection.on('disconnected', () => logger?.warn('MongoDB disconnected'))
  mongoose.connection.on('reconnected', () => logger?.info('MongoDB reconnected'))

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  // Build indexes up front so uniqueness constraints are enforced before traffic.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()))
  logger?.info({ db: mongoose.connection.name }, 'MongoDB connected')
  return mongoose.connection
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
