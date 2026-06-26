import { Injectable } from '@nestjs/common'
import { McpResource, ResourceDefinition } from '../resource.interface'
import { UserProfile } from '../user-profile.type'
import { KnowledgeService } from '@/modules/knowledge/services/knowledge.service'

@Injectable()
export class KbResource implements McpResource {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  definitions(user: UserProfile): ResourceDefinition[] {
    return [
      {
        name: 'kb_me',
        uri: 'kb://me',
        description:
          'Current user identity, accessible areas, permissions summary, and note counts.',
        mimeType: 'application/json',
        handler: async (uri) => {
          const context = await this.knowledgeService.getMyContext(user)
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'application/json',
                text: JSON.stringify(context, null, 2),
              },
            ],
          }
        },
      },
    ]
  }
}
