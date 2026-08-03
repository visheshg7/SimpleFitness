"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };

export function useSpeechInput(onTranscript: (text: string) => void) {
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition; if (Speech) { setSupported(true); recognition.current = new Speech(); } return () => recognition.current?.stop(); }, []);
  function toggle() {
    if (!recognition.current) return;
    if (listening) { recognition.current.stop(); return; }
    setError("");
    recognition.current.continuous = false;
    recognition.current.interimResults = false;
    recognition.current.lang = "en-US";
    recognition.current.onresult = (event) => { const text = Array.from(event.results).map((result) => result[0].transcript).join(" "); onTranscript(text); };
    recognition.current.onerror = () => { setError("Microphone access was not available. You can still type here."); setListening(false); };
    recognition.current.onend = () => setListening(false);
    recognition.current.start(); setListening(true);
  }
  return { supported, listening, error, toggle };
}
