import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { S3Service } from './s3.service'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { FailedMediaUploadException } from '@/commons/exceptions/s3/failed-media-upload.exception'
import { ObjectNotFoundException } from '@/commons/exceptions/s3/object-not-found.exception'

const send = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send })),
  PutObjectCommand: vi.fn((input) => ({ input })),
  GetObjectCommand: vi.fn((input) => ({ input })),
  DeleteObjectCommand: vi.fn((input) => ({ input })),
}))

function buildService(overrides: Record<string, unknown> = {}) {
  const configService = {
    get: vi.fn().mockReturnValue({
      region: 'us-east-1',
      accessKeyId: 'testAccessKeyId',
      secretAccessKey: 'testSecretAccessKey',
      s3Bucket: 'test-bucket',
      s3ForcePathStyle: false,
      ...overrides,
    }),
  } as unknown as ConfigService
  return new S3Service(configService)
}

describe('S3Service', () => {
  let service: S3Service

  beforeEach(() => {
    vi.clearAllMocks()
    send.mockResolvedValue({})
    service = buildService()
  })

  it('reports whether a bucket is configured', () => {
    expect(service.isConfigured).toBe(true)
    expect(buildService({ s3Bucket: '' }).isConfigured).toBe(false)
  })

  describe('putObject', () => {
    it('uploads under the given key with the given content type', async () => {
      const body = Buffer.from('test image')

      await service.putObject('assets/acme/abc123.png', body, 'image/png')

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'assets/acme/abc123.png',
        Body: body,
        ContentType: 'image/png',
      })
      expect(send).toHaveBeenCalledTimes(1)
    })

    /** The original service ignored the send() promise, so failures surfaced as a success. */
    it('surfaces upload failures instead of resolving', async () => {
      send.mockRejectedValueOnce(new Error('network down'))

      await expect(service.putObject('key', Buffer.from('x'), 'image/png')).rejects.toBeInstanceOf(
        FailedMediaUploadException,
      )
    })
  })

  describe('getObject', () => {
    it('returns the object body as a buffer', async () => {
      send.mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } })

      const result = await service.getObject('assets/acme/abc123.png')

      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket', Key: 'assets/acme/abc123.png' })
      expect(result).toEqual(Buffer.from([1, 2, 3]))
    })

    it('throws ObjectNotFound when the key is missing', async () => {
      send.mockRejectedValueOnce(new Error('NoSuchKey'))

      await expect(service.getObject('missing')).rejects.toBeInstanceOf(ObjectNotFoundException)
    })
  })

  describe('deleteObject', () => {
    it('swallows storage errors so an archive never fails on cleanup', async () => {
      send.mockRejectedValueOnce(new Error('boom'))

      await expect(service.deleteObject('key')).resolves.toBeUndefined()
      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'test-bucket', Key: 'key' })
    })
  })
})
