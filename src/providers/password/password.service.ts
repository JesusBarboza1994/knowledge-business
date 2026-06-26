import { Injectable } from '@nestjs/common'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    const buf = (await scryptAsync(password, salt, 64)) as Buffer
    return `${salt}:${buf.toString('hex')}`
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const hashBuffer = Buffer.from(hash, 'hex')
    const buf = (await scryptAsync(password, salt, 64)) as Buffer
    return timingSafeEqual(hashBuffer, buf)
  }
}
