import { Module } from '@nestjs/common'
import { ExampleTool } from './example.tool'

@Module({
  providers: [ExampleTool],
  exports: [ExampleTool],
})
export class ExampleModule {}
