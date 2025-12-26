'use client'

import { useState } from 'react'
import { Database } from '@/lib/database.types'
import { PLAYER_COLORS, getColorStyle } from '@/lib/colors'
import { supabase } from '@/lib/supabase'

type Player = Database['public']['Tables']['players']['Row']

interface PlayerListProps {
  players: Player[]
  currentPlayerId: string | null
  gameStatus: 'waiting' | 'playing' | 'finished'
}

export default function PlayerList({ players, currentPlayerId, gameStatus }: PlayerListProps) {
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)

  const handleColorChange = async (playerId: string, newColor: string) => {
    const { error } = await supabase
      .from('players')
      .update({ color: newColor })
      .eq('id', playerId)

    if (error) {
      console.error('Error updating color:', error)
    } else {
      setShowColorPicker(null)
    }
  }

  const canChangeColor = gameStatus === 'waiting'

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold text-lg mb-3 text-gray-800">Spelare</h3>
      <div className="space-y-2">
        {players.map((player, index) => {
          const isCurrentPlayer = player.id === currentPlayerId
          const isPickingColor = showColorPicker === player.id

          return (
            <div key={player.id}>
              <div
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isCurrentPlayer
                    ? 'bg-indigo-50 border-2 border-indigo-500'
                    : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 flex-1">
                  {/* Color indicator - clickable if it's your player and game hasn't started */}
                  <button
                    onClick={() => {
                      if (isCurrentPlayer && canChangeColor) {
                        setShowColorPicker(isPickingColor ? null : player.id)
                      }
                    }}
                    disabled={!isCurrentPlayer || !canChangeColor}
                    style={getColorStyle(player.color)}
                    className={`w-4 h-4 rounded-full border-1 border-white shadow-sm flex-shrink-0 ${
                      isCurrentPlayer && canChangeColor ? 'cursor-pointer hover:scale-110 transition-transform' : ''
                    }`}
                    title={isCurrentPlayer && canChangeColor ? 'Click to change color' : 'Your pin color'}
                  />
                  <span className="font-semibold text-gray-700">
                    {index + 1}.
                  </span>
                  <span className="font-medium text-gray-800">
                    {player.name}
                    {isCurrentPlayer && (
                      <span className="ml-2 text-xs text-indigo-600">(Du)</span>
                    )}
                  </span>
                </div>
                <span className="font-bold text-indigo-600">{player.score}</span>
              </div>

              {/* Color picker dropdown */}
              {isPickingColor && canChangeColor && (
                <div className="mt-2 p-3 bg-white border-2 border-indigo-300 rounded-lg shadow-lg">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Choose your pin color:</div>
                  <div className="flex flex-wrap gap-2">
                    {PLAYER_COLORS.map((color) => {
                      const isUsed = players.some(p => p.id !== player.id && p.color === color)
                      const isCurrent = player.color === color

                      return (
                        <button
                          key={color}
                          onClick={() => handleColorChange(player.id, color)}
                          disabled={isUsed && !isCurrent}
                          style={getColorStyle(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            isCurrent 
                              ? 'border-indigo-600 scale-110 shadow-md' 
                              : isUsed 
                              ? 'border-gray-300 opacity-40 cursor-not-allowed' 
                              : 'border-white hover:scale-110 hover:shadow-md cursor-pointer'
                          }`}
                          title={isUsed && !isCurrent ? 'Color already taken' : color}
                        />
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setShowColorPicker(null)}
                    className="mt-3 text-xs text-gray-600 hover:text-gray-800 underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {players.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            No players yet
          </p>
        )}
      </div>
    </div>
  )
}

