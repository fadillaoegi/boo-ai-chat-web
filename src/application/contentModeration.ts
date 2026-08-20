import type { ChatMode } from '../domain/chat'

export type ModerationCategory = 'violence' | 'terrorism' | 'sexual'
export type ModerationLanguage = 'en' | 'id'

export interface ModerationDecision {
  category: ModerationCategory
  response: string
}

const SAFE_CONTEXT = /\b(?:apa itu|definisi|edukasi|pendidikan|sejarah|berita|analisis|riset|penelitian|dampak|bahaya|pencegahan|mencegah|menangani|mengatasi|melaporkan|perlindungan|pemulihan|korban|kebijakan|hukum|jurnalistik|dokumenter|kesehatan|konseling|awareness|prevention|prevent|history|news|research|analysis|victim|safety|recovery)\b/i

const VIOLENCE_TERMS = /\b(?:kekerasan|bunuh|membunuh|pembunuhan|menyakiti|menyerang|serangan|menyiksa|penyiksaan|mutilasi|memukul|menembak|menusuk|meracuni|bom|ledakan|darah|gore|violence|kill|murder|attack|torture|shoot|stab|poison|bomb|bloodshed)\b/i
const VIOLENCE_HIGH_RISK = /\b(?:rakit bom|membuat bom|sembunyikan bukti|tanpa ketahuan|target korban|cara membunuh|cara meracuni|cara menyiksa|how to kill|how to murder|build a bomb|hide evidence)\b/i

const TERRORISM_TERMS = /\b(?:terorisme|teroris|kelompok teror|isis|isil|daesh|al[- ]qaeda|al qaeda|boko haram|terrorism|terrorist)\b/i
const TERRORISM_HIGH_RISK = /\b(?:rakit bom|buat propaganda|membuat propaganda|cara bergabung|danai teroris|rencana serangan|target serangan|evade detection|join a terrorist|fund terrorists|attack plan)\b/i

const SEXUAL_TERMS = /\b(?:pornografi|porno|porn|pornographic|bokep|hentai|xxx|seks eksplisit|adegan seks|konten seksual eksplisit|konten dewasa|telanjang|nude|nudity|explicit sex|sex scene|sexual content)\b/i
const SEXUAL_GENERATION = /\b(?:buat(?:kan)?|hasilkan|generate|gambar(?:kan)?|tampilkan|kirim(?:kan)?|berikan|deskripsikan|ceritakan|roleplay|show me|make|create|write)\b/i

const RESPONSES: Record<ModerationLanguage, Record<ModerationCategory, string>> = {
  en: {
    violence: 'Sorry, Boo AI cannot help create content or instructions that encourage violence or harming other people. I can still help with conflict prevention, de-escalation, safety, victim recovery, or educational context. If someone is in immediate danger, contact local emergency services now.',
    terrorism: 'Sorry, Boo AI cannot help with terrorist propaganda, recruitment, financing, or attack planning. I can still help with history, radicalization prevention, public-safety policy, threat reporting, and safe educational information.',
    sexual: 'Sorry, Boo AI cannot create or provide pornographic or sexually explicit content. I can still help with safe sexual-health education, consent, healthy relationships, child protection, or content moderation.',
  },
  id: {
    violence: 'Maaf, Boo AI tidak dapat membantu membuat konten atau instruksi yang mendorong kekerasan dan tindakan menyakiti orang lain. Saya tetap bisa membantu dengan pencegahan konflik, de-eskalasi, keselamatan, pemulihan korban, atau konteks edukatif. Jika ada seseorang yang sedang dalam bahaya, segera hubungi layanan darurat setempat.',
    terrorism: 'Maaf, Boo AI tidak dapat membantu propaganda, perekrutan, pendanaan, atau perencanaan tindakan terorisme. Saya tetap bisa membantu membahas sejarah, pencegahan radikalisasi, kebijakan keamanan publik, pelaporan ancaman, dan informasi edukatif yang aman.',
    sexual: 'Maaf, Boo AI tidak dapat membuat atau menyediakan konten pornografi maupun seksual eksplisit. Saya tetap bisa membantu dengan edukasi kesehatan seksual yang aman, persetujuan, relasi sehat, perlindungan anak, atau moderasi konten.',
  },
}

function normalizeInput(input: string): string {
  return input
    .normalize('NFKC')
    .toLocaleLowerCase('id-ID')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[_*~`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decision(
  category: ModerationCategory,
  language: ModerationLanguage,
): ModerationDecision {
  return { category, response: RESPONSES[language][category] }
}

export function moderateUserInput(
  input: string,
  mode: ChatMode,
  language: ModerationLanguage = 'en',
): ModerationDecision | null {
  const normalized = normalizeInput(input)
  if (!normalized) return null

  const safeContext = SAFE_CONTEXT.test(normalized)

  if (TERRORISM_TERMS.test(normalized)) {
    const highRisk = TERRORISM_HIGH_RISK.test(normalized)
    if (highRisk || !safeContext) return decision('terrorism', language)
  }

  if (VIOLENCE_TERMS.test(normalized)) {
    const highRisk = VIOLENCE_HIGH_RISK.test(normalized)
    if (highRisk || !safeContext) return decision('violence', language)
  }

  if (SEXUAL_TERMS.test(normalized)) {
    const generationIntent = SEXUAL_GENERATION.test(normalized) || mode === 'image'
    if (generationIntent || !safeContext) return decision('sexual', language)
  }

  return null
}
