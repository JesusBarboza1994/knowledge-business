import z from 'zod'
import { UserProfile } from './user-profile.type'

export type ToolDefinition = {
  name: string
  description: string
  schema: Record<string, z.ZodType>
  handler: (args: any) => Promise<unknown>
}

export interface McpTool {
  definitions(user: UserProfile): ToolDefinition[]
}
