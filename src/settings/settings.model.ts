export interface DatabaseConfig {
  mongoURI: string
}

export interface CacheConfig {
  url?: string
  host?: string
  port?: number
  password?: string
  ttl?: number
}

export interface AuthConfig {
  secret: string
  tokenTtl: number
}

export interface HttpConfig {
  allowedOrigins: string
  cookieSecure: boolean
  cookieSameSite: 'lax' | 'strict' | 'none'
}

export interface AwsConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  snsArn: string
  s3Bucket: string
  /** Set for S3-compatible storage (MinIO, Cloudflare R2). Empty means real AWS S3. */
  s3Endpoint?: string
  /** MinIO and most S3 clones need path-style addressing instead of virtual-host style. */
  s3ForcePathStyle: boolean
}

export interface AssetsConfig {
  maxBytes: number
  allowedMimes: string[]
}
