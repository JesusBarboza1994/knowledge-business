import { describe, expect, it } from 'vitest'
import { ParserService } from './parser.service'

const parser = new ParserService()
const names = (body: string) => parser.parse(body).links.map((link) => link.name)

describe('ParserService links', () => {
  it('extrae enlaces del texto y normaliza el nombre', () => {
    const [link] = parser.parse('Depende de [[Arquitectura Actual]].').links
    expect(link).toMatchObject({ display: 'Arquitectura Actual', name: 'arquitectura-actual', anchor: null })
  })

  it('separa el ancla del nombre del destino', () => {
    const [link] = parser.parse('Ver [[Presupuesto 2026#Q1]].').links
    expect(link).toMatchObject({ name: 'presupuesto-2026', anchor: 'Q1' })
  })

  it('indexa los enlaces escritos dentro de un encabezado', () => {
    const parsed = parser.parse('## Sección sobre [[Destino]]\n\nTexto.')
    expect(parsed.links.map((link) => link.name)).toEqual(['destino'])
    expect(parsed.links[0].source_block).toBe(parsed.headings[0].id)
  })

  it('ignora los enlaces dentro de código en línea', () => {
    // Es exactamente lo que hace la plantilla de índice de área.
    expect(names('- Una entrada por nota: `- [[Note Title]] — resumen.`')).toEqual([])
  })

  it('ignora los enlaces dentro de un bloque cercado', () => {
    const body = ['Antes [[Real]].', '```md', '- [[Ejemplo]]', '## Encabezado falso', '```', 'Después [[Otra]].'].join(
      '\n',
    )
    const parsed = parser.parse(body)
    expect(parsed.links.map((link) => link.name)).toEqual(['real', 'otra'])
    // Un encabezado dentro del bloque de código tampoco es un encabezado.
    expect(parsed.headings).toEqual([])
  })

  it('solo cierra el bloque con el mismo delimitador con el que se abrió', () => {
    const body = ['```', '[[Dentro]]', '~~~', '[[Sigue dentro]]', '```', '[[Fuera]]'].join('\n')
    expect(names(body)).toEqual(['fuera'])
  })

  it('distingue el código en línea del texto que lo rodea', () => {
    expect(names('Usa `[[plantilla]]` para enlazar a [[Destino Real]].')).toEqual(['destino-real'])
  })

  it('mantiene los bloques de código como bloques del documento', () => {
    const parsed = parser.parse('```\ncodigo\n```')
    expect(parsed.blocks.map((block) => block.text)).toEqual(['```', 'codigo', '```'])
  })
})
