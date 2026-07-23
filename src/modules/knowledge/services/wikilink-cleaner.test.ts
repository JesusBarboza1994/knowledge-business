import { describe, expect, it } from 'vitest'
import { unlinkWikiReferences } from './wikilink-cleaner'

describe('unlinkWikiReferences', () => {
  it('convierte las referencias eliminadas en texto plano', () => {
    const result = unlinkWikiReferences('Ver [[MMS Payments]] y [[mms-payments#Cuotas]], además de [[Otra nota]].', [
      'mms-payments',
    ])

    expect(result).toEqual({
      body: 'Ver MMS Payments y mms-payments, además de [[Otra nota]].',
      removedLinks: 2,
    })
  })
})
