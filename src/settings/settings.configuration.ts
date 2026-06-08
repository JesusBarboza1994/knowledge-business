import * as process from 'process'

export default () => ({
  db: {
    mongoURI: process.env.MONGO_URI,
  },
  cache: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD,
    ttl: Number(process.env.REDIS_TTL ?? '300'),
  },
  auth: {
    secret: process.env.AUTH_TOKEN_SECRET,
    adminApiKey: process.env.AUTH_ADMIN_API_KEY,
    tokenTtl: Number(process.env.AUTH_TOKEN_TTL ?? String(86400 * 30)),
  },
})
