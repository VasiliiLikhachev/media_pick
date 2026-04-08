'use client'

import { useState, useCallback } from 'react'
import { EntityType, ResultRow } from '@/lib/types'

const ENTITY_TYPES: EntityType[] = ['СМИ', 'Конкурс', 'Научная статья', 'Ассоциация']

type Step = 'idle' | 'keywords_loading' | 'keywords_done' | 'candidates_loading' | 'candidates_done' | 'ranking_loading' | 'results_done'

interface CandidateRow {
  id: number
  name: string | null
  url: string | null
  entity_type: string | null
  topic: string | null
  description: string | null
  'Описание generated': string | null
  'Отрасли': string | null
  region: string | null
  traffic: string | number | null
  price: string | null
  currency: string | null
  base_name: string | null
  [key: string]: string | number | null | undefined
}

function downloadCSV(results: ResultRow[], entityType: string) {
  if (!results.length) return
  const headers = Object.keys(results[0])
  const rows = results.map(r =>
    headers.map(h => `"${String((r as unknown as Record<string, string>)[h] ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${entityType}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--tag-bg)', border: '1px solid rgba(92,92,255,0.2)',
      borderRadius: 4, color: 'var(--accent)',
      fontSize: 11, fontFamily: 'JetBrains Mono, monospace', padding: '3px 8px',
    }}>
      {label}
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', color: 'var(--accent)',
        cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.6,
      }}>×</button>
    </span>
  )
}

export default function HomePage() {
  const [task, setTask] = useState('')
  const [entityTypes, setEntityTypes] = useState<EntityType[]>(['СМИ'])
  const [topN, setTopN] = useState(20)

  // Step state
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)

  // Step 1 output — editable
  const [keywords, setKeywords] = useState<string[]>([])
  const [region, setRegion] = useState<string>('')
  const [newKeyword, setNewKeyword] = useState('')

  // Step 2 output
  const [candidates, setCandidates] = useState<CandidateRow[]>([])

  // Step 3 output
  const [results, setResults] = useState<ResultRow[]>([])

  const toggleType = useCallback((type: EntityType) => {
    setEntityTypes([type])
  }, [])

  // ── Step 1: Extract keywords ──
  const handleExtractKeywords = async () => {
    if (!task.trim()) return
    setError(null)
    setStep('keywords_loading')
    setKeywords([])
    setRegion('')
    setCandidates([])
    setResults([])

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setKeywords(data.keywords || [])
      setRegion(data.region || '')
      setStep('keywords_done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setStep('idle')
    }
  }

  // ── Step 2: Fetch candidates from Supabase ──
  const handleFetchCandidates = async () => {
    setError(null)
    setStep('candidates_loading')
    setCandidates([])
    setResults([])

    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, entityTypes, region }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCandidates(data.candidates || [])
      setStep('candidates_done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setStep('keywords_done')
    }
  }

  // ── Step 3: Rank with Claude ──
  const handleRank = async () => {
    setError(null)
    setStep('ranking_loading')
    setResults([])

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, candidates, topN, region }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.results || [])
      setStep('results_done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
      setStep('candidates_done')
    }
  }

  const isLoading = step === 'keywords_loading' || step === 'candidates_loading' || step === 'ranking_loading'

  return (
    <main className="app">
      {/* Header */}
      <header className="header">
        <div className="header-eyebrow">PR · AI-подборка</div>
        <h1>Media Picker</h1>
        <p>Введи задание — получи топ медиа с обоснованием</p>
      </header>

      {/* ── BLOCK 1: Task form ── */}
      <div className="card">
        <div className="form-grid">
          <div>
            <label className="field-label">Задание</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Клиент, продукт, цель, аудитория, гео..."
              rows={4}
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="field-label">Тип площадки</label>
            <div className="toggle-group">
              {ENTITY_TYPES.map(type => (
                <button
                  key={type}
                  className={`toggle-btn ${entityTypes.includes(type) ? 'active' : ''}`}
                  onClick={() => toggleType(type)}
                  disabled={isLoading}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div className="topn-row">
              <label className="field-label" style={{ marginBottom: 0 }}>Топ</label>
              <input
                type="number"
                className="topn-input"
                value={topN}
                min={1} max={100}
                onChange={e => setTopN(Math.max(1, Math.min(100, Number(e.target.value))))}
                disabled={isLoading}
              />
              <span className="topn-label">позиций</span>
            </div>
            <button
              className="btn-primary"
              onClick={handleExtractKeywords}
              disabled={isLoading || !task.trim() || entityTypes.length === 0}
            >
              {step === 'keywords_loading' ? (
                <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Анализирую...</>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {step === 'idle' ? 'Извлечь ключевые слова' : 'Заново'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-state">
          <strong>Ошибка</strong>{error}
        </div>
      )}

      {/* ── BLOCK 2: Keywords ── */}
      {(step === 'keywords_done' || step === 'candidates_loading' || step === 'candidates_done' || step === 'ranking_loading' || step === 'results_done') && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>1</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Запрос к базе</span>
            </div>
            {step === 'keywords_done' && (
              <button className="btn-primary" onClick={handleFetchCandidates}>
                Отправить в Supabase →
              </button>
            )}
            {step === 'candidates_loading' && (
              <button className="btn-primary" disabled>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Запрашиваю базу...
              </button>
            )}
          </div>

          {/* Region */}
          <div style={{ marginBottom: 14 }}>
            <label className="field-label">Регион</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="не определён"
                disabled={step !== 'keywords_done'}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: region ? 'var(--warning)' : 'var(--text-dim)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                  padding: '6px 12px', outline: 'none', width: 200,
                }}
              />
              {region && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  фильтр будет применён в Claude
                </span>
              )}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className="field-label">Ключевые слова</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {keywords.map(kw => (
                <Tag
                  key={kw}
                  label={kw}
                  onRemove={() => step === 'keywords_done'
                    ? setKeywords(prev => prev.filter(k => k !== kw))
                    : undefined
                  }
                />
              ))}
            </div>
            {step === 'keywords_done' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newKeyword.trim()) {
                      setKeywords(prev => [...prev, newKeyword.trim()])
                      setNewKeyword('')
                    }
                  }}
                  placeholder="+ добавить слово (Enter)"
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                    padding: '5px 10px', outline: 'none', width: 200,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BLOCK 3: Candidates ── */}
      {(step === 'candidates_done' || step === 'ranking_loading' || step === 'results_done') && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>2</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Кандидаты из базы
              </span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                color: 'var(--success)', background: 'rgba(62,207,142,0.1)',
                border: '1px solid rgba(62,207,142,0.2)',
                borderRadius: 4, padding: '1px 7px',
              }}>
                {candidates.length} записей
              </span>
            </div>
            {step === 'candidates_done' && (
              <button className="btn-primary" onClick={handleRank}>
                Отправить в Claude →
              </button>
            )}
            {step === 'ranking_loading' && (
              <button className="btn-primary" disabled>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Claude ранжирует...
              </button>
            )}
          </div>

          {candidates.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              Ничего не найдено. Попробуй изменить ключевые слова или тип.
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Название</th>
                    <th>Ссылка</th>
                    <th>Тип</th>
                    <th>Тематика</th>
                    <th>Описание</th>
                    <th>Отрасли</th>
                    <th>Регион</th>
                    <th>Трафик</th>
                    <th>Цена</th>
                    <th>База</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((row, i) => (
                    <tr key={row.id || i}>
                      <td className="rank-cell">{i + 1}</td>
                      <td className="name-cell">
                        {row.url
                          ? <a href={String(row.url)} target="_blank" rel="noopener noreferrer">{row.name || '—'}</a>
                          : (row.name || '—')}
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 180, wordBreak: 'break-all' }}>
                        {row.url
                          ? <a href={String(row.url)} target="_blank" rel="noopener noreferrer">{String(row.url)}</a>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td>{row.entity_type
                        ? <span className="subtype-tag">{String(row.entity_type)}</span>
                        : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.topic || '—'}</td>
                      <td className="reason-cell" style={{ fontSize: 12 }}>
                        {String(row.description || row['Описание generated'] || '—').slice(0, 120)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {String(row['Отрасли'] || '—').slice(0, 60)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={String(row.region || '')}>
                        {String(row.region || '—').slice(0, 60)}{String(row.region || '').length > 60 ? '…' : ''}
                      </td>
                      <td className="traffic-cell">{row.traffic ? Number(row.traffic).toLocaleString() : '—'}</td>
                      <td className="price-cell">
                        {row.price ? `${row.price}${row.currency ? ' ' + row.currency : ''}` : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{row.base_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BLOCK 4: Results ── */}
      {(step === 'results_done') && (
        <div>
          <div className="results-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>3</span>
              <span className="results-title">Результаты подборки</span>
            </div>
            {results.length > 0 && (
              <button className="btn-secondary" onClick={() => downloadCSV(results, entityTypes[0] || 'media')}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M6.5 1V9M6.5 9L3.5 6M6.5 9L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Скачать CSV
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="empty-state">Нет результатов.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Название</th>
                    <th>Ссылка</th>
                    <th>Описание</th>
                    <th>Тематика</th>
                    <th>Причина выбора</th>
                    <th>Цена</th>
                    <th>Подтип</th>
                    <th>Трафик</th>
                    <th>Регион</th>
                    <th>Дата / Дедлайн</th>
                    <th>Сроки выхода</th>
                    <th>Формы участия</th>
                    <th>Тип (ISSN / ISBN)</th>
                    <th>База</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i}>
                      <td className="rank-cell">{row.Критерий}</td>
                      <td className="name-cell">
                        {row.Ссылка
                          ? <a href={row.Ссылка} target="_blank" rel="noopener noreferrer">{row.Название}</a>
                          : row.Название}
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 180, wordBreak: 'break-all' }}>
                        {row.Ссылка
                          ? <a href={row.Ссылка} target="_blank" rel="noopener noreferrer">{row.Ссылка}</a>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td className="reason-cell" style={{ fontSize: 12 }}>
                        {row.Описание || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td>{row.Тематика && <span className="topic-tag">{row.Тематика}</span>}</td>
                      <td className="reason-cell">
                        {row['Причина выбора'].startsWith('⚠️')
                          ? <span className="warn">{row['Причина выбора']}</span>
                          : row['Причина выбора']}
                      </td>
                      <td className="price-cell">
                        {row['Цена из базы']
                          ? `${row['Цена из базы']}${row.Валюта ? ' ' + row.Валюта : ''}`
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td>{row.Подтип ? <span className="subtype-tag">{row.Подтип}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                      <td className="traffic-cell">
                        {row.Трафик ? Number(row.Трафик).toLocaleString() : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={row.Регион || ''}>
                        {(row.Регион || '—').slice(0, 60)}{(row.Регион || '').length > 60 ? '…' : ''}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {row['Дата проведения'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row['Описание сроков выхода'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row['Формы участия'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row['Индексирование и архивирование'] || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {row['Из какой базы'] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
