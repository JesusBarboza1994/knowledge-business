import { SetMetadata } from '@nestjs/common'

export const SKIP_RESPONSE_INTERCEPTOR = 'skipResponseInterceptor'

export const SkipResponse = () => SetMetadata(SKIP_RESPONSE_INTERCEPTOR, true)
