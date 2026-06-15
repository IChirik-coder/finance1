import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Get all transactions grouped by month
    const transactions = await db.transaction.findMany({
      orderBy: { date: 'desc' },
    })

    // Aggregate by month
    const monthMap = new Map<string, { month: number; year: number; income: number; expense: number; count: number }>()

    for (const t of transactions) {
      const d = new Date(t.date)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      const existing = monthMap.get(key)
      if (existing) {
        if (t.type === 'income') existing.income += t.amount
        else existing.expense += t.amount
        existing.count++
      } else {
        monthMap.set(key, {
          month: d.getMonth() + 1,
          year: d.getFullYear(),
          income: t.type === 'income' ? t.amount : 0,
          expense: t.type === 'expense' ? t.amount : 0,
          count: 1,
        })
      }
    }

    // Sort by date descending
    const result = Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return b.month - a.month
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('GET /api/transactions/history error:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
