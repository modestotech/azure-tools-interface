import { Check, Copy, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type CopyState = 'idle' | 'copied' | 'failed'

/** Writes `text` to the clipboard; rejects where the Clipboard API is missing (e.g. plain http). */
async function writeClipboard(text: string): Promise<void> {
  // The type says it's always there, but browsers leave it out of insecure contexts.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(text)
}

/**
 * Copies `text` to the clipboard and confirms for a moment. If the browser refuses (no permission,
 * insecure context), it says so, so the user knows to select the text by hand.
 */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const show = (next: CopyState) => {
    setState(next)
    setTimeout(
      () => {
        setState('idle')
      },
      next === 'failed' ? 4000 : 1500,
    )
  }
  const copy = () => {
    writeClipboard(text).then(
      () => {
        show('copied')
      },
      () => {
        show('failed')
      },
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label}>
        {state === 'copied' ? <Check /> : state === 'failed' ? <X /> : <Copy />}
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Not copied' : label}
      </Button>
      {state === 'failed' && (
        <span role="alert" className="text-destructive text-xs">
          The browser blocked the clipboard. Select the text and copy it by hand.
        </span>
      )}
    </span>
  )
}
