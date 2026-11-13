import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { getThread, reportThread, sendMessage, setBlocked, subscribeMessages } from '../lib/chat'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Spinner, btn, btnGhost, card, input } from '../components/ui'
import type { MessageDoc, ThreadDoc } from '../lib/types'

export default function Chat() {
  const { threadId = '' } = useParams()
  const { user } = useAuth()
  const [thread, setThread] = useState<ThreadDoc | null | undefined>(undefined)
  const [messages, setMessages] = useState<MessageDoc[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(`mute:${threadId}`) === '1' } catch { return false } })
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let unsub: (() => void) | undefined
    getThread(threadId).then((t) => {
      setThread(t)
      if (t) unsub = subscribeMessages(threadId, setMessages, (e) => setError(friendlyError(e)))
    }).catch((e) => { setError(friendlyError(e)); setThread(null) })
    return () => unsub?.()
  }, [threadId])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!user || !text.trim()) return
    try { await sendMessage(threadId, user.uid, text.trim()); setText('') } catch (err) { setError(friendlyError(err)) }
  }
  const run = async (fn: () => Promise<void>) => { try { setError(null); await fn() } catch (e) { setError(friendlyError(e)) } }

  if (thread === undefined) return <Spinner />
  if (!thread || !user) return <p className="text-sm text-mu">Chat is not available.</p>
  const blockedByMe = thread.blockedBy === user.uid
  const blocked = thread.blockedBy !== ''
  const toggleMute = () => { const v = !muted; setMuted(v); try { localStorage.setItem(`mute:${threadId}`, v ? '1' : '0') } catch { /* storage may be unavailable */ } }
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Messages</h1>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          {(!blocked || blockedByMe) && <button className={btnGhost} onClick={() => run(async () => { await setBlocked(threadId, user.uid, !blockedByMe); setThread({ ...thread, blockedBy: blockedByMe ? '' : user.uid }) })}>{blockedByMe ? 'Unblock' : 'Block'}</button>}
          <button className={btnGhost} onClick={() => run(async () => { await reportThread(threadId, user.uid, 'Reported from chat'); setThread({ ...thread, reported: true }) })} disabled={thread.reported}>{thread.reported ? 'Reported' : 'Report'}</button>
        </div>
      </div>
      <p className="text-xs text-mu">Text only. Do not share payment details. An admin can read this chat only if it is reported.</p>
      <ErrorBox message={error} />
      <div className={`${card} h-80 space-y-2 overflow-y-auto`} aria-live={muted ? 'off' : 'polite'}>
        {messages.map((m) => (
          <p key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.senderId === user.uid ? 'ml-auto bg-ye text-ink' : 'bg-ln text-tx'}`}>{m.text}</p>
        ))}
        <div ref={end} />
      </div>
      {blocked ? <p className="text-sm text-mu">{blockedByMe ? 'You blocked this chat.' : 'This chat has been blocked.'}</p> : (
        <form onSubmit={send} className="flex gap-2">
          <input aria-label="Message" className={input} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          <button className={btn} disabled={!text.trim()}>Send</button>
        </form>
      )}
    </div>
  )
}
