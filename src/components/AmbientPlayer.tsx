import { SettingsContent } from "./LanguageSettings";
import { t, useTranslation } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Volume2 } from "lucide-react";
import type { AmbientClock } from "../hooks/useRoom";

export function ambientPosition(state: AmbientClock, now = performance.now()) {
  const elapsed = state.playing ? Math.max(0, now - state.receivedAt) : 0;
  return ((state.position_ms + elapsed) % state.duration_ms) / 1000;
}

export function AmbientPlayer({
  state,
  onPlaying,
}: {
  state: AmbientClock | null;
  onPlaying: (playing: boolean) => boolean;
}) {
  useTranslation();
  const audio = useRef<HTMLAudioElement>(null);
  const latest = useRef(state);
  latest.current = state;
  const [listening, setListening] = useState(false);
  const [volume, setVolume] = useState(25);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const currentGeneration = ++generation.current;
    let starting = false;
    function sync() {
      const current = latest.current;
      if (!element || !current) {
        element?.pause();
        return;
      }
      const target = ambientPosition(current);
      setPosition(target);
      if (!listening || !current.playing) {
        element.pause();
        return;
      }
      if (element.readyState < 1) return;
      // Circular distance avoids unnecessary jumps around the loop boundary.
      const duration = current.duration_ms / 1000;
      const distance = Math.abs(element.currentTime - target) % duration;
      if (Math.min(distance, duration - distance) > 0.35)
        element.currentTime = target;
      if (element.paused && !starting) {
        starting = true;
        void element
          .play()
          .catch(() => {
            if (generation.current !== currentGeneration) return;
            setListening(false);
            setError("Could not start audio. Try enabling listening again.");
          })
          .finally(() => {
            starting = false;
          });
      }
    }
    sync();
    const interval = setInterval(sync, 1000);
    element.addEventListener("loadedmetadata", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      ++generation.current;
      clearInterval(interval);
      element.removeEventListener("loadedmetadata", sync);
      document.removeEventListener("visibilitychange", sync);
      element.pause();
    };
  }, [listening, state?.playing, state === null]);

  // Call play directly in the user gesture to unlock desktop/web autoplay.
  function toggleListening() {
    setError("");
    if (listening) {
      setListening(false);
      audio.current?.pause();
      return;
    }
    const element = audio.current;
    if (!element || !state) return;
    element.volume = volume / 100;
    if (element.readyState >= 1) element.currentTime = ambientPosition(state);
    const attempt = element.play();
    setListening(true);
    // The effect pauses again if the shared room is paused.
    void attempt.catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("Could not start audio. Try enabling listening again.");
      setListening(false);
    });
  }

  return (
    <section className="ambient-player" aria-labelledby="ambient-title">
      <audio
        ref={audio}
        src="/audio/soft-noise-v1.wav"
        loop
        preload="auto"
        onError={() => {
          setError("Could not load the audio track. Try reopening the room.");
          setListening(false);
        }}
      />
      <div className="ambient-heading">
        <h2 id="ambient-title">
          <Headphones size={18} /> {t("Shared ambience")}
        </h2>
        <span>{t("Soft noise · 30-second loop")}</span>
      </div>
      <p className="muted" aria-live="polite">
        {!state
          ? t("Waiting for a connection — listening is paused.")
          : state.playing
            ? t("The room is playing audio.")
            : t("Room playback is paused.")}
      </p>
      <div className="ambient-controls">
        <button
          className="button"
          disabled={!state}
          onClick={() => {
            if (state && !onPlaying(!state.playing))
              setError("Connection lost. Try again after reconnecting.");
          }}
        >
          {state?.playing ? <Pause size={16} /> : <Play size={16} />}
          {state?.playing ? t("Pause for everyone") : t("Play for everyone")}
        </button>
        <button
          className="button"
          disabled={!state && !listening}
          onClick={toggleListening}
        >
          {listening ? t("Stop listening") : t("Start listening")}
        </button>
        <SettingsContent section="audio">
          <label className="ambient-volume">
            <Volume2 size={16} /> {t("My volume")}
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
            <span>{volume} %</span>
          </label>
          <p>
            {t(
              "Volume changes apply immediately. Listening stays under your control in the room.",
            )}
          </p>
        </SettingsContent>
        <span className="mono" aria-label={t("Track position")}>
          {state
            ? `0:${Math.floor(position).toString().padStart(2, "0")} / 0:30`
            : "— / 0:30"}
        </span>
      </div>
      <p className="muted">
        {t(
          "Room members share playback controls. Listening and volume are personal.",
        )}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
