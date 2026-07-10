import { Module } from '@nestjs/common'
import { ToolsModule } from '@/tools/tools.module'

@Module({
  imports: [ToolsModule],
})
export class McpModule {}
