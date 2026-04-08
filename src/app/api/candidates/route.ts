import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// ── Normalize country aliases ──────────────────────────────────────────────
function normalizeCountry(input: string): string {
  const s = input.trim()
  const aliases: Record<string, string> = {
    'usa': 'United States of America',
    'us': 'United States of America',
    'united states': 'United States of America',
    'uk': 'United Kingdom',
    'great britain': 'United Kingdom',
    'uae': 'United Arab Emirates',
  }
  return aliases[s.toLowerCase()] ?? s
}

// ── Country → allowed region tokens ───────────────────────────────────────
const CIS = [
  'Whole region CIS (Commonwealth of Independent States)',
  'Whole region Former USSR',
]
const CIS_COUNTRIES = [
  'Kazakhstan','Belarus','Ukraine','Armenia','Azerbaijan',
  'Georgia','Moldova','Kyrgyzstan','Tajikistan','Uzbekistan','Turkmenistan',
]
const EUROPE_COUNTRIES = [
  'Germany','France','Italy','Spain','Poland','Netherlands','Sweden','Norway',
  'Denmark','Finland','Switzerland','Austria','Belgium','Portugal','Greece',
  'Romania','Bulgaria','Czech Republic','Czechia','Slovakia','Hungary',
  'Croatia','Serbia','Slovenia','Estonia','Latvia','Lithuania',
  'Ireland','United Kingdom','Iceland','Luxembourg','Malta','Cyprus',
  'Albania','Bosnia and Herzegovina','Montenegro','North Macedonia','Kosovo',
]
const EUROPE_REGIONS = [
  'Whole region Europe','Whole region Eastern Europe','Whole region Western Europe',
  'Whole region Northern Europe','Whole region Southern Europe',
]
const ASIA_COUNTRIES = [
  'China','Japan','South Korea','India','Thailand','Vietnam','Indonesia',
  'Philippines','Malaysia','Singapore','Bangladesh','Pakistan','Sri Lanka',
  'Nepal','Myanmar','Cambodia','Laos','Mongolia','Hong Kong','Taiwan',
]
const ASIA_REGIONS = [
  'Whole region Asia','Whole region East Asia','Whole region Southeast Asia',
  'Whole region South Asia','Whole region Central Asia',
]
const MENA_COUNTRIES = [
  'United Arab Emirates','Saudi Arabia','Qatar','Israel','Jordan','Turkey',
  'Egypt','Iran','Iraq','Kuwait','Oman','Lebanon','Bahrain',
]
const MENA_REGIONS = [
  'Whole region Middle East (Western Asia)','Whole region Western Asia (Middle East)',
  'Whole region North Africa',
]
const AMERICAS_COUNTRIES = [
  'United States of America','Canada','Mexico','Brazil','Argentina',
  'Colombia','Chile','Peru','Venezuela','Ecuador','Bolivia',
]
const AMERICAS_REGIONS = [
  'Whole region Americas','Whole region North America','Whole region South America',
  'Whole region Central America','Whole region Caribbean',
]
const AFRICA_COUNTRIES = [
  'South Africa','Nigeria','Kenya','Ghana','Ethiopia','Tanzania',
  'Egypt','Morocco','Senegal','Uganda','Rwanda',
]
const AFRICA_REGIONS = [
  'Whole region Africa','Whole region Sub-Saharan Africa','Whole region West Africa',
  'Whole region East Africa','Whole region Southern Africa','Whole region Central Africa',
  'Whole region North Africa',
]
const OCEANIA_COUNTRIES = ['Australia','New Zealand']
const OCEANIA_REGIONS = [
  'Whole region Oceania','Whole region Australia and New Zealand',
]

const INTERNATIONAL = ['International','Global']

function getAllowedTokens(country: string): string[] | null {
  if (!country) return null
  const c = normalizeCountry(country)

  // Russia — strictly only Russia (but multi-value strings containing Russia are ok)
  if (c.toLowerCase() === 'russia') return ['Russia']

  const tokens: string[] = [c, ...INTERNATIONAL]

  if (CIS_COUNTRIES.includes(c)) tokens.push(...CIS)
  if (EUROPE_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...EUROPE_REGIONS)
  if (ASIA_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...ASIA_REGIONS)
  if (MENA_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...MENA_REGIONS)
  if (AMERICAS_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...AMERICAS_REGIONS)
  if (AFRICA_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...AFRICA_REGIONS)
  if (OCEANIA_COUNTRIES.some(e => e.toLowerCase() === c.toLowerCase())) tokens.push(...OCEANIA_REGIONS)

  return tokens
}

// ── Parse region field into array of tokens ────────────────────────────────
function parseRegionField(regionValue: string | null | undefined): string[] {
  if (!regionValue) return []
  // Split by " • " or ", "
  return regionValue.split(/\s*•\s*|,\s*/).map(s => s.trim()).filter(Boolean)
}

// ── Check if a row's region matches allowed tokens ─────────────────────────
function matchesRegion(rowRegion: string | null | undefined, allowed: string[] | null): boolean {
  if (!allowed) return true // no region filter
  if (!rowRegion) return true // no region in row — include

  const rowTokens = parseRegionField(rowRegion)

  // For Russia: row must contain "Russia" somewhere
  if (allowed.length === 1 && allowed[0] === 'Russia') {
    return rowTokens.some(t => t.toLowerCase() === 'russia')
  }

  // For other countries: any token in row must be in allowed list
  return rowTokens.some(t =>
    allowed.some(a => a.toLowerCase() === t.toLowerCase())
  )
}

// ── Normalize traffic ──────────────────────────────────────────────────────
function normalizeTraffic(val: string | number | null | undefined): number {
  if (!val && val !== 0) return 0
  if (typeof val === 'number') return val
  const s = String(val).replace(/\s/g, '').toUpperCase()
  const num = parseFloat(s.replace(/[KМK]/g, '').replace(',', '.'))
  if (isNaN(num)) return 0
  if (s.includes('M') || s.includes('М')) return Math.round(num * 1_000_000)
  if (s.includes('K') || s.includes('К')) return Math.round(num * 1_000)
  return Math.round(num)
}

// ── Build ILIKE OR conditions ──────────────────────────────────────────────
function buildOrConditions(fields: string[], keywords: string[]): string[] {
  const conditions: string[] = []
  for (const field of fields) {
    for (const kw of keywords) {
      if (kw.trim()) conditions.push(`"${field}".ilike.%${kw.trim()}%`)
    }
  }
  return conditions
}

// ── Negative content filter — exclude шоу-бизнес rows ─────────────────────
const NEGATIVE_PATTERNS = [
  /шоу[- ]?бизнес/i,
  /show[- ]?business/i,
  /шоубиз/i,
]

const NEGATIVE_CHECK_FIELDS = [
  'name', 'description', 'Описание generated', 'Описание SimilarWeb',
  'topic', 'Отрасли', 'Категории или кластеры', 'Для кого',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasNegativeContent(row: Record<string, any>): boolean {
  return NEGATIVE_CHECK_FIELDS.some(field => {
    const val = String(row[field] ?? '')
    return NEGATIVE_PATTERNS.some(p => p.test(val))
  })
}

// ── Parse deadline date — returns timestamp or null ────────────────────────
function parseDeadline(val: string | number | null | undefined): number | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s || s === '—' || s === '-') return null

  // Try native Date parse (handles ISO, DD.MM.YYYY poorly — do manually first)
  // DD.MM.YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    if (!isNaN(d.getTime())) return d.getTime()
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    if (!isNaN(d.getTime())) return d.getTime()
  }

  // Fallback: let JS try
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

const PRIMARY_FIELDS = ['description', 'Описание generated', 'Описание SimilarWeb']
const SECONDARY_FIELDS = ['name', 'Отрасли', 'Категории или кластеры', 'Для кого', 'Для кого / есть ли органичения?', 'topic']
const SELECT_COLS = 'id, name, url, entity_type, topic, description, "Описание generated", "Отрасли", region, "Страны", traffic, price, currency, base_name, "Недостатки издания", "Подтип", "подтип.1", "Крайняя дата подачи", "Доступные формы участия", "Индексирование и архивирование", "Для кого", "Категории или кластеры", "Номинации", "Часто одобряют"'
const MIN_TRAFFIC = 15_000
const MIN_PRIMARY = 30

async function fetchRows(
  orConditions: string[],
  entityTypes: string[]
) {
  let query = getSupabase()
    .from('media_base')
    .select(SELECT_COLS)
    .limit(500)

  if (entityTypes?.length > 0) {
    query = query.in('entity_type', entityTypes)
  }
  if (orConditions.length > 0) {
    query = query.or(orConditions.join(','))
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function POST(req: NextRequest) {
  try {
    const { keywords, entityTypes, region } = await req.json()
    const allowed = getAllowedTokens(region)

    // ── Step 1: primary fields ──
    const primaryConditions = buildOrConditions(PRIMARY_FIELDS, keywords || [])
    let rows = await fetchRows(primaryConditions, entityTypes || [])

    // Apply region filter
    let filtered = rows.filter(r => matchesRegion(r.region, allowed))

    // Apply traffic filter for СМИ only
    filtered = filtered.filter(r =>
      r.entity_type === 'СМИ' ? normalizeTraffic(r.traffic) >= MIN_TRAFFIC : true
    )

    // Exclude шоу-бизнес
    filtered = filtered.filter(r => !hasNegativeContent(r))

    // ── Step 2: secondary fields if not enough ──
    if (filtered.length < MIN_PRIMARY) {
      const secondaryConditions = buildOrConditions(SECONDARY_FIELDS, keywords || [])
      const secondaryRows = await fetchRows(secondaryConditions, entityTypes || [])

      // Merge — no dedup (different prices from different vendors)
      const primaryIds = new Set(rows.map(r => r.id))
      const newRows = secondaryRows.filter(r => !primaryIds.has(r.id))
      rows = [...rows, ...newRows]

      filtered = rows.filter(r => matchesRegion(r.region, allowed))
      filtered = filtered.filter(r =>
        r.entity_type === 'СМИ' ? normalizeTraffic(r.traffic) >= MIN_TRAFFIC : true
      )

      // Exclude шоу-бизнес
      filtered = filtered.filter(r => !hasNegativeContent(r))
    }

    // Sort: конкурсы — by deadline date asc (nulls last), others — by traffic desc
    const isContest = filtered.length > 0 && filtered[0].entity_type === 'Конкурс'

    if (isContest) {
      filtered.sort((a, b) => {
        const da = parseDeadline(a['Крайняя дата подачи'])
        const db = parseDeadline(b['Крайняя дата подачи'])
        if (da && db) return da - db      // both valid — nearest first
        if (da) return -1                  // only a has date — a first
        if (db) return 1                   // only b has date — b first
        return 0                           // both null — keep order
      })
    } else {
      filtered.sort((a, b) => normalizeTraffic(b.traffic) - normalizeTraffic(a.traffic))
    }

    return NextResponse.json({ candidates: filtered, total: filtered.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
