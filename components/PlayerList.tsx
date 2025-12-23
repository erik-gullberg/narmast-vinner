'use client'

import { Database } from '@/lib/database.types'

type Player = Database['public']['Tables']['players']['Row']

interface PlayerListProps {
  players: Player[]
  currentPlayerId: string | null
}

export default function PlayerList({ players, currentPlayerId }: PlayerListProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold text-lg mb-3 text-gray-800">Players</h3>
      <div className="space-y-2">
        {players.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between p-3 rounded-lg ${
              player.id === currentPlayerId
                ? 'bg-indigo-50 border-2 border-indigo-500'
                : 'bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">
                {index + 1}.
              </span>
              <span className="font-medium text-gray-800">
                {player.name}
                {player.id === currentPlayerId && (
                  <span className="ml-2 text-xs text-indigo-600"></span>
                )}
              </span>
            </div>
            <span className="font-bold text-indigo-600">{player.score}</span>
          </div>
        ))}
        {players.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            No players yet
          </p>
        )}
      </div>
    </div>
  )
}

