import type { ChatImage, ChatMessage } from '../domain/chat'

const MAX_PREVIOUS_IMAGE_PROMPTS = 8
const MAX_PROMPT_CHARACTERS = 6_000

export interface ImageGenerationContext {
  prompt: string
  images: ChatImage[]
  continuedFromPrevious: boolean
}

function getMessageImages(message: ChatMessage): ChatImage[] {
  if (message.images?.length) return message.images
  return message.image ? [message.image] : []
}

function hasGeneratedImage(message: ChatMessage): boolean {
  return getMessageImages(message).some((image) => image.kind === 'generated')
}

function findLatestGeneratedImage(messages: ChatMessage[]): ChatImage | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const images = getMessageImages(messages[messageIndex])
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      if (images[imageIndex].kind === 'generated') return images[imageIndex]
    }
  }
  return null
}

function collectSuccessfulImagePrompts(messages: ChatMessage[]): string[] {
  const prompts: string[] = []
  let pendingUserPrompt = ''

  messages.forEach((message) => {
    if (message.role === 'user') {
      pendingUserPrompt = message.content.trim()
      return
    }
    if (pendingUserPrompt && hasGeneratedImage(message)) prompts.push(pendingUserPrompt)
    pendingUserPrompt = ''
  })

  return prompts.slice(-MAX_PREVIOUS_IMAGE_PROMPTS)
}

function limitPromptHistory(prompts: string[]): string[] {
  const selected: string[] = []
  let remainingCharacters = MAX_PROMPT_CHARACTERS

  for (let index = prompts.length - 1; index >= 0; index -= 1) {
    const prompt = prompts[index]
    if (!prompt) continue
    if (prompt.length <= remainingCharacters) {
      selected.push(prompt)
      remainingCharacters -= prompt.length
      continue
    }
    if (!selected.length && remainingCharacters > 0) selected.push(prompt.slice(-remainingCharacters))
    break
  }

  return selected.reverse()
}

export function buildImageGenerationContext(
  previousMessages: ChatMessage[],
  currentPrompt: string,
  currentImages: ChatImage[] = [],
): ImageGenerationContext {
  const previousPrompts = limitPromptHistory(collectSuccessfulImagePrompts(previousMessages))
  const latestGeneratedImage = findLatestGeneratedImage(previousMessages)
  const continuedFromPrevious = previousPrompts.length > 0 && latestGeneratedImage !== null

  if (!continuedFromPrevious) {
    return { prompt: currentPrompt, images: currentImages, continuedFromPrevious: false }
  }

  const promptHistory = previousPrompts
    .map((prompt, index) => `${index + 1}. ${prompt}`)
    .join('\n')
  const prompt = `Create the complete updated image for this iterative request.

Previous successful image instructions (oldest to newest):
${promptHistory}

Current requested change:
${currentPrompt}

Preserve the people, objects, setting, composition, visual style, lighting, camera angle, and other details from the previous image unless the current request explicitly replaces or removes them. Apply the current request as an addition or modification to that existing image, not as an unrelated new scene. Use attached images as visual references when present. Any Boo AI logo or watermark in a reference is an interface artifact: do not reproduce it in the generated scene.`

  return {
    prompt,
    images: currentImages.length ? currentImages : [latestGeneratedImage],
    continuedFromPrevious: true,
  }
}
