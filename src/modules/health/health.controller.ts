import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  @ResponseMessage('HEALTH_SUCCESS', 'Service is healthy')
  getHealth() {
    return {
      status: 'OK',
      version: 'mcp',
      timestamp: new Date().toISOString(),
    }
  }
}
