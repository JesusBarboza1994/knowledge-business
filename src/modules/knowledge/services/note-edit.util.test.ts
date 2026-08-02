import { describe, expect, it } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { applyEdits, EditOperation } from './note-edit.util'

const body = ['# Título', '', 'Intro con [[Nota A]].', '', 'Sección repetida.', 'Sección repetida.', ''].join('\n')

describe('applyEdits', () => {
  it('reemplaza una única coincidencia', () => {
    const result = applyEdits(body, [
      { op: 'replace', find: 'Intro con [[Nota A]].', replacement: 'Intro con [[Nota B]].' },
    ])
    expect(result).toContain('[[Nota B]]')
    expect(result).not.toContain('[[Nota A]]')
  })

  it('falla cuando la coincidencia única es ambigua', () => {
    expect(() => applyEdits(body, [{ op: 'replace', find: 'Sección repetida.', replacement: 'x' }])).toThrow(
      BadRequestException,
    )
  })

  it('reemplaza todas las coincidencias con all=true', () => {
    const result = applyEdits(body, [{ op: 'replace', find: 'Sección repetida.', replacement: 'Única.', all: true }])
    expect(result.match(/Única\./g)).toHaveLength(2)
    expect(result).not.toContain('repetida')
  })

  it('falla cuando el texto a buscar no existe', () => {
    expect(() => applyEdits(body, [{ op: 'replace', find: 'no-existe', replacement: 'x' }])).toThrow(
      BadRequestException,
    )
  })

  it('elimina un fragmento', () => {
    const result = applyEdits(body, [{ op: 'delete', find: 'Intro con [[Nota A]].' }])
    expect(result).not.toContain('Nota A')
  })

  it('inserta después de un ancla', () => {
    const result = applyEdits(body, [
      { op: 'insert_after', anchor: 'Intro con [[Nota A]].', text: '\n\nNuevo párrafo.' },
    ])
    expect(result).toContain('[[Nota A]].\n\nNuevo párrafo.')
  })

  it('inserta antes de un ancla', () => {
    const result = applyEdits(body, [{ op: 'insert_before', anchor: '# Título', text: '<!-- meta -->\n' }])
    expect(result.startsWith('<!-- meta -->\n# Título')).toBe(true)
  })

  it('falla al insertar sobre un ancla ambigua', () => {
    expect(() => applyEdits(body, [{ op: 'insert_after', anchor: 'Sección repetida.', text: 'x' }])).toThrow(
      BadRequestException,
    )
  })

  it('append y prepend operan en los extremos', () => {
    const result = applyEdits(body, [
      { op: 'append', text: '\n- 2026-08-02 NOTE: entrada' },
      { op: 'prepend', text: '<!-- top -->\n' },
    ])
    expect(result.startsWith('<!-- top -->\n')).toBe(true)
    expect(result.endsWith('\n- 2026-08-02 NOTE: entrada')).toBe(true)
  })

  it('aplica ediciones en orden, cada una sobre el resultado de la anterior', () => {
    const edits: EditOperation[] = [
      { op: 'replace', find: 'Título', replacement: 'Encabezado' },
      { op: 'insert_after', anchor: '# Encabezado', text: ' actualizado' },
    ]
    const result = applyEdits(body, edits)
    expect(result).toContain('# Encabezado actualizado')
  })
})
