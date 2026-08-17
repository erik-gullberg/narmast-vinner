'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import KofiButton from '@/components/KofiButton'
import { createGame, SOLO_GAME } from '@/lib/createGame'

export default function Home() {
  const router = useRouter()
  const [startingSolo, setStartingSolo] = useState(false)
  const [error, setError] = useState('')

  // 65% of all games ever played had exactly one player. Those players used to
  // have to pick a mode, a length, a timer and a name, then sit in a lobby that
  // told them to share the code with their friends, then press Start, then
  // press "Börja gissa". This is that whole path collapsed into one button.
  const playSolo = async () => {
    if (startingSolo) return
    setStartingSolo(true)
    setError('')
    try {
      const code = await createGame({ ...SOLO_GAME, playerName: 'Du' })
      router.push(`/game/${code}`)
    } catch (err) {
      console.error('Error starting solo game:', err)
      setError('Det gick inte att starta spelet. Försök igen.')
      setStartingSolo(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 pt-2 bg-gradient-to-br from-blue-50 to-indigo-100">
      <img
        className="mt-8 mb-4 animate-bounce [animation-duration:2s]"
        src="/logo.png"
        alt="Närmast Vinner logotyp - geografispel"
        width={80}
        height={80}
      />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 relative">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
          Närmast Vinner
        </h1>
        <h2 className="text-center text-gray-600 mb-8">
          Gissa var händelser och platser inträffade på kartan &amp; utmana dina vänner!
        </h2>

        {/* Hidden SEO content for search engines */}
        <p className="sr-only">
          Välkommen till Närmast Vinner (Narmast Vinner) - geografispelet från på spåret
          där du gissar var historiska händelser inträffade på kartan.
          Spela gratis själv eller med vänner online.
          Perfekt för spelkvällar och tävlingar. Fungerar på mobil, surfplatta och dator.
        </p>

        <div className="space-y-4">
          <button
            onClick={playSolo}
            disabled={startingSolo}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg touch-manipulation disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {startingSolo ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Startar...
              </>
            ) : 'Spela själv'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Eller spela med vänner</span>
            </div>
          </div>

          <button
            onClick={() => router.push('/join')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg touch-manipulation"
          >
            Gå med i spel
          </button>

          <button
            onClick={() => router.push('/create')}
            className="w-full bg-white hover:bg-gray-50 text-indigo-700 border-2 border-indigo-600 font-semibold py-4 px-6 rounded-lg transition-colors text-lg touch-manipulation"
          >
            Skapa nytt spel
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-center">
        <KofiButton />
      </div>
    </main>
  )
}
