import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { Controller, Get } from '@nestjs/common'
import { Public } from '@/commons/decorators/public.decorator'

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ResponseMessage('HEALTH_SUCCESS', 'Service is healthy')
  getHealth() {
    return {
      status: 'OK',
      version: 'mcp',
      timestamp: new Date().toISOString(),
    }
  }
}
