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
  private readonly logger = new Logger(S3Service.name)

  constructor(private readonly configService: ConfigService) {
    const aws = this.configService.get<AwsConfig>('aws')

    this.s3Client = new S3Client({
      region: aws?.region ?? '',
      credentials: {
        accessKeyId: aws?.accessKeyId ?? '',
        secretAccessKey: aws?.secretAccessKey ?? '',
      },
      // MinIO and R2 need an explicit endpoint; real S3 resolves it from the region.
      ...(aws?.s3Endpoint ? { endpoint: aws.s3Endpoint, forcePathStyle: aws.s3ForcePathStyle } : {}),
    })

    this.bucket = aws?.s3Bucket ?? ''
  }

  /** Lets callers fail with a clear message instead of a raw SDK error when no bucket is set. */
  get isConfigured(): boolean {
    return this.bucket.length > 0
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
      )
    } catch (error) {
      this.logger.error(`Failed to upload ${key} to S3`, error)
      throw new FailedMediaUploadException(error instanceof Error ? error.message : String(error))
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
