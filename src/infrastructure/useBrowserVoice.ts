import { useCallback, useRef, useState } from 'react'

interface SpeechResultEvent {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

export function useBrowserVoice(language: 'en' | 'id' = 'en') {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechFinishRef = useRef<(() => void) | null>(null)
  const [isListening, setIsListening] = useState(false)
  const isSupported = typeof window !== 'undefined' && Boolean(getRecognitionConstructor())
  const isSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  const startListening = useCallback((onTranscript: (text: string) => void) => {
    const Recognition = getRecognitionConstructor()
    if (!Recognition) return false

    const recognition = new Recognition()
    recognition.lang = language === 'id' ? 'id-ID' : 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim()
      if (transcript) onTranscript(transcript)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setIsListening(false)
    }
    recognition.onerror = () => {
      recognitionRef.current = null
      setIsListening(false)
    }

    recognition.start()
    setIsListening(true)
    return true
  }, [language])

  const stopSpeaking = useCallback(() => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    speechFinishRef.current?.()
    speechFinishRef.current = null
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      onEnd?.()
      return
    }
    window.speechSynthesis.cancel()
    speechFinishRef.current?.()
    const utterance = new SpeechSynthesisUtterance(text)
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (speechFinishRef.current === finish) speechFinishRef.current = null
      onEnd?.()
    }
    speechFinishRef.current = finish
    utterance.lang = language === 'id' ? 'id-ID' : 'en-US'
    utterance.rate = 1
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  }, [language])

  return {
    isSupported,
    isSpeechSupported,
    isListening,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}
