import { UserProfile } from './user-profile.type'

export type ResourceContents = {
  uri: string
  text: string
  mimeType?: string
}

export type ResourceDefinition = {
  name: string
  uri: string
  description: string
  mimeType: string
  handler: (uri: URL) => Promise<{ contents: ResourceContents[] }>
}

export interface McpResource {
  definitions(user: UserProfile): ResourceDefinition[]
}
