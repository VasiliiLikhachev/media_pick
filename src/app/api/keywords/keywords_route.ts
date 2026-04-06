import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json()
    if (!task?.trim()) return NextResponse.json({ error: 'Задание пустое' }, { status: 400 })

    const msg = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Из PR-задания извлеки:
1. 8-12 ключевых слов для поиска медиа (короткие, 1-2 слова, русские и английские)
2. Целевой регион на английском (например: Russia, USA) или null если не указан

Верни ТОЛЬКО JSON без пояснений:
{"keywords": ["слово1", "слово2"], "region": "Russia"}

Задание: ${task}`
      }]
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json({
      keywords: parsed.keywords || [],
      region: parsed.region || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
