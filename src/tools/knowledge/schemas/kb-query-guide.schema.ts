import { z } from 'zod'

export const kbQueryGuideSchema = {
  question: z.string().describe('The question to answer using the Knowledge Hub'),
}
