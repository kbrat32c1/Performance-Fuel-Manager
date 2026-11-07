import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined;

/**
 * Dictation for a text box. `onText` gets the transcript so far (interim results included)
 * while the athlete speaks. Unsupported browsers get `supported: false`.
 */
export function useSpeechInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  const stop = useCallback(() => recognitionRef.current?.stop?.(), []);

  const start = useCallback(() => {
    if (!SpeechRecognitionImpl || listening) return;
    setError(null);
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      onTextRef.current(text.trim());
    };
    recognition.onerror = (event: any) => {
      setError(event.error === 'not-allowed' ? 'Microphone access is off for this site.' : "Didn't catch that. Try again.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening]);

  return { supported: !!SpeechRecognitionImpl, listening, error, start, stop };
}
