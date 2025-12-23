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
import EventDisplay from "./EventDisplay";
import L from "leaflet";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Guess = Database["public"]["Tables"]["guesses"]["Row"];
type Player = Database["public"]["Tables"]["players"]["Row"];

interface ResultsProps {
  event: Event;
  guesses: Guess[];
  players: Player[];
  isHost: boolean;
  onNextRound: () => void;
}

// Custom icon for the actual event location
const eventIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function Results({
  event,
  guesses,
  players,
  isHost,
  onNextRound,
}: ResultsProps) {
  const [mounted, setMounted] = useState(false);

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

  // Sort guesses by distance (closest first)
  const sortedGuesses = [...guesses].sort(
    (a, b) => a.distance_km - b.distance_km
  );

  const getPlayerName = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player?.name || "Unknown";
  };

  return (
    <div className="space-y-6">
      {/* Event Details */}
      <EventDisplay event={event} showDetails={true} />

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
            {guesses.map((guess) => (
              <div key={guess.id}>
                <Marker position={[guess.latitude, guess.longitude]}>
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
                  color="#3b82f6"
                  weight={2}
                  opacity={0.6}
                  dashArray="5, 10"
                />
              </div>
            ))}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading map...</p>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="p-6">
        <h3 className="font-bold text-xl mb-4">Round Results</h3>
        <div className="space-y-3">
          {sortedGuesses.map((guess, index) => {
            const points = Math.max(0, Math.round(1000 - guess.distance_km));
            const isWinner = index === 0;

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
                  <div>
                    <div className="font-semibold text-gray-800">
                      {getPlayerName(guess.player_id)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {guess.distance_km.toFixed(0)} km ifrån
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
          {sortedGuesses.length === 0 && (
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
