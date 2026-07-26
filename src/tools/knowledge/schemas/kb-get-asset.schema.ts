import { z } from 'zod'

export const kbGetAssetSchema = {
  ref: z.string().describe('Asset id, or the kb:asset/<id> reference exactly as it appears inside a note body'),
}
