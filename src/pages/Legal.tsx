import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getLegal } from '../lib/catalog'
import { Spinner } from '../components/ui'
import type { LegalDoc } from '../lib/types'

export default function Legal() {
  const { id = '' } = useParams()
  return <LegalBody key={id} id={id} />
}

function LegalBody({ id }: { id: string }) {
  const [docu, setDocu] = useState<LegalDoc | null | undefined>(undefined)
  useEffect(() => { getLegal(id).then(setDocu).catch(() => setDocu(null)) }, [id])
  if (docu === undefined) return <Spinner />
  if (!docu) return <p className="text-sm text-mu">This document is not available.</p>
  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-bold">{docu.title}</h1>
      <p className="mt-1 text-xs text-mu">Version {docu.version}</p>
      <div className="mt-4 whitespace-pre-line text-sm leading-6 text-tx">{docu.body}</div>
    </article>
  )
}
