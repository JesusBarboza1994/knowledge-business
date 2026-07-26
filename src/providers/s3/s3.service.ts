import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { Injectable, Logger } from '@nestjs/common'
import { AwsConfig } from '@/settings/settings.model'
import { FailedMediaUploadException } from '@/commons/exceptions/s3/failed-media-upload.exception'
import { ObjectNotFoundException } from '@/commons/exceptions/s3/object-not-found.exception'

/**
 * Blob storage behind a key. Deliberately knows nothing about notes, areas or permissions:
 * objects stay private and are never served from S3 directly — callers stream them through an
 * authorized endpoint, so a leaked key on its own grants nothing.
 */
@Injectable()
export class S3Service {
  private readonly s3Client: S3Client
  private readonly bucket: string
  private readonly hasStaticCredentials: boolean
  private readonly logger = new Logger(S3Service.name)

  constructor(private readonly configService: ConfigService) {
    const aws = this.configService.get<AwsConfig>('aws')

    this.s3Client = new S3Client({
      region: aws?.region ?? '',
      /**
       * Only pass static keys when both are present. Handing the SDK a pair of empty strings makes
       * it sign requests with a blank access key and S3 answers "authorization header is
       * malformed", which reads like a bug rather than missing configuration. Omitting the field
       * falls back to the default credential chain, which is what an IAM role needs.
       */
      ...(aws?.accessKeyId && aws?.secretAccessKey
        ? { credentials: { accessKeyId: aws.accessKeyId, secretAccessKey: aws.secretAccessKey } }
        : {}),
      // MinIO and R2 need an explicit endpoint; real S3 resolves it from the region.
      ...(aws?.s3Endpoint ? { endpoint: aws.s3Endpoint, forcePathStyle: aws.s3ForcePathStyle } : {}),
    })

    this.bucket = aws?.s3Bucket ?? ''
    this.hasStaticCredentials = Boolean(aws?.accessKeyId && aws?.secretAccessKey)
  }

  /** Lets callers fail with a clear message instead of a raw SDK error when no bucket is set. */
  get isConfigured(): boolean {
    return this.bucket.length > 0
  }

  /**
   * Names what is missing. Static keys are optional — on an instance with an IAM role the default
   * credential chain supplies them — so this reports rather than blocks.
   */
  get configurationHint(): string | null {
    if (!this.bucket) return 'AWS_S3_BUCKET is empty'
    if (!this.hasStaticCredentials) {
      return 'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are empty — relying on the default AWS credential chain'
    }
    return null
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      )
    } catch (error) {
      this.logger.error(`Failed to upload ${key} to S3`, error)
      const reason = error instanceof Error ? error.message : String(error)
      const hint = this.configurationHint
      throw new FailedMediaUploadException(hint ? `${reason} (${hint})` : reason)
    }
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      const bytes = await result.Body?.transformToByteArray()
      if (!bytes) throw new ObjectNotFoundException(key)
      return Buffer.from(bytes)
    } catch (error) {
      if (error instanceof ObjectNotFoundException) throw error
      this.logger.error(`Failed to read ${key} from S3`, error)
      throw new ObjectNotFoundException(key)
    }
  }

  /**
   * Best-effort by design: a missing object is already the desired end state, and a storage hiccup
   * must not fail the caller — the record is archived either way and a later sweep can retry.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (error) {
      this.logger.warn(`Failed to delete ${key} from S3: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
