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
  adminApiKey: string
  tokenTtl: number
}

export interface AwsConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  snsArn: string
}
