export type EntityType = 'СМИ' | 'Конкурс' | 'Научные статьи' | 'Ассоциация'

export interface MediaRow {
  id: number
  name: string | null
  url: string | null
  entity_type: string | null
  base_name: string | null
  price: string | null
  currency: string | null
  region: string | null
  traffic: string | null
  description: string | null
  topic: string | null
  'Для кого': string | null
  'Для кого / есть ли органичения?': string | null
  'Категории или кластеры': string | null
  'Номинации': string | null
  'Описание SimilarWeb': string | null
  'Описание generated': string | null
  'Отрасли': string | null
  'Подтип': string | null
  'подтип.1': string | null
  'Тип публикации': string | null
  'Крайняя дата подачи': string | null
  'Доступные формы участия': string | null
  'Индексирование и архивирование': string | null
  'Страны': string | null
  'Недостатки издания': string | null
  'Specifics': string | null
  [key: string]: string | number | null | undefined
}

export interface SearchParams {
  task: string
  entityTypes: EntityType[]
  topN: number
}

export interface ResultRow {
  Критерий: string
  Название: string
  Ссылка: string
  'Цена из базы': string
  Валюта: string
  'Причина выбора': string
  Тематика: string
  'Из какой базы': string
  Подтип: string
  Трафик: string
  'Дата проведения': string
  'Формы участия': string
  'Индексирование и архивирование': string
  Регион: string
}
