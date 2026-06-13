import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const VALID_PLATFORMS = [
  'Яндекс карты', 'Google карты', '2ГИС', 'Яндекс Услуги',
  'Профи.ру', 'Авито', 'Озон', 'ВКонтакте', 'Telegram',
  'Яндекс Дзен', 'Tripadvisor', 'Другое'
]

function validateTaxRate(taxRate: unknown, type: string): number | null {
  if (type !== 'income') return null
  if (taxRate === undefined || taxRate === null || taxRate === 'none') return null
  const rate = Number(taxRate)
  if (rate !== 4 && rate !== 6) throw new Error('taxRate must be 4 or 6')
  return rate
}

function validatePlatforms(platforms: unknown, type: string): string | null {
  if (type !== 'income') return null
  if (!platforms) return null
  let parsed: unknown[]
  if (typeof platforms === 'string') {
    try { parsed = JSON.parse(platforms) } catch { throw new Error('Invalid platforms JSON') }
  } else if (Array.isArray(platforms)) {
    parsed = platforms
  } else {
    return null
  }
  const valid = parsed.filter((p: unknown) => {
    if (!p || typeof p !== 'object') return false
    const entry = p as Record<string, unknown>
    return VALID_PLATFORMS.includes(entry.name as string) && Number(entry.reviewCount) > 0
  })
  return JSON.stringify(valid)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    const transactions = await db.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(transactions, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('GET /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, amount, description, date, taxRate, platforms, category } = body

    if (!type || !amount || !description) {
      return NextResponse.json({ error: 'type, amount, description are required' }, { status: 400 })
    }
    if (type !== 'income' && type !== 'expense') {
      return NextResponse.json({ error: 'type must be "income" or "expense"' }, { status: 400 })
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }

    const validatedTaxRate = validateTaxRate(taxRate, type)
    const validatedPlatforms = validatePlatforms(platforms, type)

    const transaction = await db.transaction.create({
      data: {
        type,
        amount: Number(amount),
        description,
        date: date ? new Date(date) : new Date(),
        taxRate: validatedTaxRate,
        platforms: validatedPlatforms,
        category: type === 'expense' ? (category || null) : null,
      },
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('POST /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const type = updates.type || existing.type
    const data: Record<string, unknown> = {}

    if (updates.type !== undefined) data.type = updates.type
    if (updates.amount !== undefined) data.amount = Number(updates.amount)
    if (updates.description !== undefined) data.description = updates.description
    if (updates.date !== undefined) data.date = new Date(updates.date)

    if (updates.taxRate !== undefined || updates.type !== undefined) {
      const validatedTaxRate = validateTaxRate(
        updates.taxRate !== undefined ? updates.taxRate : existing.taxRate,
        type
      )
      data.taxRate = validatedTaxRate
    }

    if (updates.platforms !== undefined || updates.type !== undefined) {
      const validatedPlatforms = validatePlatforms(
        updates.platforms !== undefined ? updates.platforms : existing.platforms,
        type
      )
      data.platforms = validatedPlatforms
    }

    if (type === 'expense') {
      data.category = updates.category !== undefined ? (updates.category || null) : existing.category
    } else {
      data.category = null
    }

    const transaction = await db.transaction.update({
      where: { id },
      data,
    })

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('PUT /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await db.transaction.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
