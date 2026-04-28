'use client'

import { useRouter } from 'next/navigation'
import KofiButton from '@/components/KofiButton';

export default function Home() {
  const router = useRouter()

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
          Spela gratis med vänner online.
          Perfekt för spelkvällar och tävlingar. Fungerar på mobil, surfplatta och dator.
        </p>

        <div className="space-y-4">
          <button
            onClick={() => router.push('/join')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg touch-manipulation"
          >
            Gå med i spel
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Eller</span>
            </div>
          </div>

          <button
            onClick={() => router.push('/create')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg touch-manipulation"
          >
            Skapa nytt spel
          </button>
        </div>
      </div>
      <div className="mt-6 flex justify-center">
        <KofiButton />
      </div>
    </main>
  )
}
