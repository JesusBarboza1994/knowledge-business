import z from 'zod'
import { UserProfile } from './user-profile.type'

export type PromptMessage = {
  role: 'user' | 'assistant'
  content: { type: 'text'; text: string }
}

export type PromptDefinition = {
  name: string
  description: string
  argsSchema?: Record<string, z.ZodType>
  handler: (args: Record<string, string>) => Promise<{ messages: PromptMessage[] }>
}

export interface McpPrompt {
  definitions(user: UserProfile): PromptDefinition[]
}
