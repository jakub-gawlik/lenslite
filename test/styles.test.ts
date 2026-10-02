import { describe, expect, it } from 'vitest'
import { CSS, injectStyles } from '../src/styles.js'

describe('injectStyles', () => {
  it('injects the stylesheet into a given document once', () => {
    const doc = document.implementation.createHTMLDocument()
    injectStyles(doc)
    injectStyles(doc)
    const styles = doc.head.querySelectorAll('style[data-lenslite]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe(CSS)
  })
})
