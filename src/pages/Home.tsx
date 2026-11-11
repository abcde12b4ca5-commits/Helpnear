import { Link } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { btn, btnGhost } from '../components/ui'

export default function Home() {
  const { user, profile } = useAuth()
  return (
    <div className="py-6">
      <h1 className="text-3xl font-bold sm:text-4xl">{brand.tagline}</h1>
      <p className="mt-3 max-w-2xl text-gray-700">
        Post what you need done and local workers in your area can reach out. Workers choose the trades and the distance they cover and see only the requests that fit. Free to use.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!user && (<><Link to="/signup" className={btn}>Get started</Link><Link to="/how-it-works" className={btnGhost}>How it works</Link></>)}
        {user && profile?.role === 'client' && <Link to="/post" className={btn}>Post a request</Link>}
        {user && profile?.role === 'worker' && <Link to="/feed" className={btn}>See requests</Link>}
      </div>
      <p className="mt-10 text-sm text-gray-600">Available across the United States. House cleaning, handyman jobs, pressure washing, painting, lawn care and more.</p>
    </div>
  )
}
