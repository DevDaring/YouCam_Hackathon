import { describe, expect, it } from 'vitest'
import bn from './messages/bn.json'
import en from './messages/en.json'
import hi from './messages/hi.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') acc[path] = v
    else Object.assign(acc, flatten(v, path))
    return acc
  }, {})
}

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort()

const EN = flatten(en as Tree)
const LOCALES = { hi: flatten(hi as Tree), bn: flatten(bn as Tree) }

// Event keys served by GET /api/regions — every one needs a label.
const EVENT_KEYS = [
  'haldi', 'mehendi', 'sangeet', 'wedding', 'reception', 'engagement', 'puja', 'party', 'gaye_holud', 'bou_bhat',
  'baraat', 'walima', 'nikah', 'eid', 'diwali', 'durga_puja', 'teej', 'dashain', 'avurudu', 'homecoming',
]

describe('i18n messages', () => {
  it('has labels for every event key', () => {
    for (const key of EVENT_KEYS) expect(EN[`events.${key}`], key).toBeTruthy()
  })

  for (const [name, messages] of Object.entries(LOCALES)) {
    describe(name, () => {
      it('contains every key from en', () => {
        const missing = Object.keys(EN).filter((k) => !(k in messages))
        expect(missing).toEqual([])
      })

      it('has no extra keys that en lacks', () => {
        const extra = Object.keys(messages).filter((k) => !(k in EN))
        expect(extra).toEqual([])
      })

      it('has no empty strings and keeps interpolation placeholders', () => {
        for (const [k, v] of Object.entries(messages)) {
          expect(v.trim(), k).not.toBe('')
          expect(placeholders(v), k).toEqual(placeholders(EN[k]))
        }
      })

      it('is actually translated (non-Latin script in most strings)', () => {
        const script = name === 'bn' ? /[ঀ-৿]/ : /[ऀ-ॿ]/
        const translated = Object.values(messages).filter((v) => script.test(v)).length
        expect(translated / Object.keys(messages).length).toBeGreaterThan(0.9)
      })
    })
  }
})
