"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import { Database } from "@/lib/database.types";
import L from "leaflet";
import { createPlayerIcon, getColorStyle, getHexColor } from "@/lib/colors";
import { supabase } from "@/lib/supabase";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Guess = Database["public"]["Tables"]["guesses"]["Row"];
type Player = Database["public"]["Tables"]["players"]["Row"];
type Game = Database["public"]["Tables"]["games"]["Row"];

interface ResultsProps {
  event: Event;
  guesses: Guess[];
  players: Player[];
  game: Game;
  isHost: boolean;
  onNextRound: () => void;
}

const eventIcon = new L.Icon({
  iconUrl: "/logo.png",
  iconSize: [35, 47],
  iconAnchor: [17, 47],
  popupAnchor: [0, -47],
});

export default function Results({
  event,
  guesses,
  players,
  game,
}: ResultsProps) {
  const [mounted, setMounted] = useState(false);
  const [scoringDone, setScoringDone] = useState(false);

  useEffect(() => {
    // Fix for default marker icons in Leaflet
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
    });
    setMounted(true);
  }, []);

  // Award points for closest_wins mode
  useEffect(() => {
    if (game.game_mode === 'closest_wins' && guesses.length > 0 && !scoringDone) {
      const awardPointsToClosest = async () => {
        // Find the closest guess
        const sortedGuesses = [...guesses].sort((a, b) => a.distance_km - b.distance_km);
        const closestGuess = sortedGuesses[0];

        if (closestGuess) {
          // Award 1 point to the closest player
          const { data: player } = await supabase
            .from('players')
            .select('score')
            .eq('id', closestGuess.player_id)
            .single();

          if (player) {
            await supabase
              .from('players')
              .update({ score: player.score + 1 })
              .eq('id', closestGuess.player_id);
          }
        }

        setScoringDone(true);
      };

      awardPointsToClosest();
    }
  }, [game.game_mode, guesses, scoringDone]);

  // Sort guesses by distance (closest first)
  const sortedGuesses = [...guesses].sort(
    (a, b) => a.distance_km - b.distance_km
  );

  const getPlayerName = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player?.name || "Unknown";
  };

  const getPlayerColor = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player?.color || "blue";
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-xl overflow-hidden">
        {/* Event location reveal */}
        <div className="relative h-96 bg-gray-200">
        {mounted ? (
          <MapContainer
            center={[event.latitude, event.longitude]}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            />
            {/* Event location marker */}
            <Marker
              position={[event.latitude, event.longitude]}
              icon={eventIcon}
            >
              <Popup>
                <strong>{event.title}</strong>
                <br />
                Actual Location
              </Popup>
            </Marker>
            {/* All guesses markers */}
            {guesses.map((guess) => {
              const playerColor = getPlayerColor(guess.player_id);
              const playerIcon = createPlayerIcon(playerColor);

              if (!playerIcon) return null;

              return (
              <div key={guess.id}>
                <Marker position={[guess.latitude, guess.longitude]} icon={playerIcon}>
                  <Popup>
                    <strong>{getPlayerName(guess.player_id)}</strong>
                    <br />
                    {guess.distance_km.toFixed(0)} km away
                  </Popup>
                </Marker>
                {/* Line from guess to actual location */}
                <Polyline
                  positions={[
                    [guess.latitude, guess.longitude],
                    [event.latitude, event.longitude],
                  ]}
                  color={getHexColor(playerColor)}
                  weight={3}
                  opacity={0.7}
                  dashArray="5, 10"
                />
              </div>
            )})}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading map...</p>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="p-6">
        <h3 className="font-bold text-xl mb-4">Resultat</h3>
        <div className="space-y-3">
          {sortedGuesses.map((guess, index) => {
            const isWinner = index === 0;
            const playerColor = getPlayerColor(guess.player_id);

            // Calculate points based on game mode
            let points: number;
            if (game.game_mode === 'closest_wins') {
              points = isWinner ? 1 : 0;
            } else {
              points = Math.max(0, Math.round(1000 - guess.distance_km));
            }

            return (
              <div
                key={guess.id}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  isWinner
                    ? "bg-yellow-100 border-2 border-yellow-400"
                    : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-600">
                    {index + 1}
                    {isWinner && "🏆"}
                  </span>
                  <div className="flex items-center gap-2">
                    <div style={getColorStyle(playerColor)} className="w-4 h-4 rounded-full border-2 border-white shadow-sm" title="Pin color" />
                    <div>
                      <div className="font-semibold text-gray-800">
                        {getPlayerName(guess.player_id)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {guess.distance_km.toFixed(0)} km ifrån
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-indigo-600">
                    +{points} poäng
                  </div>
                </div>
              </div>
            );
          })}

          {/* Show players who didn't guess */}
          {players.filter(p => !guesses.find(g => g.player_id === p.id)).map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-4 rounded-lg bg-gray-100 border border-gray-300 opacity-60"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl text-gray-400">-</span>
                <div>
                  <div className="font-semibold text-gray-600">
                    {player.name}
                  </div>
                  <div className="text-sm text-gray-500 italic">
                    Ingen gissning
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-400">
                  0 poäng
                </div>
              </div>
            </div>
          ))}

          {sortedGuesses.length === 0 && players.length === 0 && (
            <p className="text-gray-500 text-center py-4">
              No guesses submitted
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
