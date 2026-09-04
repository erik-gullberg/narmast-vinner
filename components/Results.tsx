"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import { Database } from "@/lib/database.types";
import L from "leaflet";
import {
  createPlayerIcon,
  fixLeafletDefaultIcon,
  getColorStyle,
  getHexColor,
} from "@/lib/colors";
import { pointsForGuess } from "@/lib/scoring";
import { BASEMAP_ATTRIBUTION, BASEMAP_URL } from "@/lib/basemap";

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
  const [showDescription, setShowDescription] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fixLeafletDefaultIcon();
    setMounted(true);
  }, []);

  // Scoring deliberately lives nowhere in this component.
  //
  // It used to award points here, which meant it ran once per connected
  // client: with five players the closest guesser received somewhere between
  // +1 and +5 points depending on how the read-modify-write races resolved.
  // close_round() now awards points exactly once, server-side, guarded by the
  // round_results primary key. This component is a pure view.

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
        <div className="relative h-96 lg:h-[32rem] xl:h-[36rem] bg-gray-200">
        {mounted ? (
          <MapContainer
            center={[event.latitude, event.longitude]}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            className="z-0"
          >
            <TileLayer attribution={BASEMAP_ATTRIBUTION} url={BASEMAP_URL} />
            {/* Event location marker */}
            <Marker
              position={[event.latitude, event.longitude]}
              icon={eventIcon}
            >
              <Popup>
                <strong>{event.title}</strong>
                <br />
                Rätt plats
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
                    {guess.distance_km.toFixed(0)} km ifrån
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
            <p className="text-gray-500">Laddar karta...</p>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="p-6">
        {/* Event title and optional description */}
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{event.title}</h2>
            {event.description && (
              <button
                onClick={() => setShowDescription((v) => !v)}
                className="touch-manipulation flex-shrink-0 text-sm text-indigo-600 font-semibold hover:text-indigo-800 transition-colors"
              >
                {showDescription ? 'Dölj beskrivning' : 'Visa beskrivning'}
              </button>
            )}
          </div>
          {showDescription && event.description && (
            <div
              ref={descriptionRef}
              className="mt-3 text-gray-600 text-sm leading-relaxed border-t pt-3"
            >
              {event.description}
            </div>
          )}
        </div>

        <h3 className="font-bold text-xl mb-4">Resultat</h3>
        <div className="space-y-3">
          {sortedGuesses.map((guess, index) => {
            const isWinner = index === 0;
            const playerColor = getPlayerColor(guess.player_id);

            // Display only. close_round() is authoritative; pointsForGuess
            // mirrors its formula so the two cannot drift.
            const points = pointsForGuess(
              game.game_mode,
              guess.distance_km,
              isWinner
            );

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
              Inga gissningar skickades
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
