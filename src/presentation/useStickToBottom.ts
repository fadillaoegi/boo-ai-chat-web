import { useCallback, useEffect, useRef } from 'react'

function distanceFromBottom(): number {
  return document.documentElement.scrollHeight - window.innerHeight - window.scrollY
}

// Dasar dokumen, bukan elemen terakhir pesan: kotak input sticky menutupi ~130px terbawah layar.
function scrollToBottom(behavior: ScrollBehavior) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
}

/**
 * Ikuti jawaban ke bawah selama pengguna tidak sedang membaca bagian atas.
 * Mengembalikan fungsi untuk memaksa kembali mengikuti (misalnya saat pengguna mengirim pesan).
 */
export function useStickToBottom(messagesKey: unknown, isLoading: boolean, streamingKey: unknown) {
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    // Hanya gerakan pengguna yang mematikan auto-follow; scroll programatik (termasuk animasi
    // smooth yang tersusul konten baru) tidak boleh dianggap pengguna sedang membaca ke atas.
    function handleScroll() {
      if (distanceFromBottom() < 40) stickToBottomRef.current = true
    }
    function handleWheel(event: WheelEvent) {
      if (event.deltaY < 0) stickToBottomRef.current = false
    }
    function handleTouchMove() {
      stickToBottomRef.current = false
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('textarea, input, select')) return
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stickToBottomRef.current = false
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('smooth')
  }, [messagesKey, isLoading])

  useEffect(() => {
    if (streamingKey && stickToBottomRef.current) scrollToBottom('auto')
  }, [streamingKey])

  return useCallback(() => {
    stickToBottomRef.current = true
  }, [])
}
