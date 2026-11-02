import { Module } from '@nestjs/common'
import { RepositoryModule } from '@/repository/repository.module'
import { AuthTokenService } from './auth-token.service'

@Module({
  imports: [RepositoryModule],
  providers: [AuthTokenService],
  exports: [AuthTokenService],
})
export class AuthTokenModule {}
