import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

interface PlatformEntry { name: string; reviewCount: number }

function parsePlatforms(p: string | null): PlatformEntry[] {
  if (!p) return []
  try { return JSON.parse(p) } catch { return [] }
}

function getNetIncome(t: { type: string; amount: number; taxRate: number | null; platforms: string | null }, feeMap: Record<string, number>): number {
  if (t.type === 'expense') return 0 // Only income contributes to net income
  let net = t.amount
  // Subtract tax
  if (t.taxRate) net -= (t.taxRate / 100) * t.amount
  // Subtract executor fees
  for (const p of parsePlatforms(t.platforms)) {
    net -= (feeMap[p.name] || 0) * p.reviewCount
  }
  return net
}

// Build fee map from all unique platform names found in transactions
function buildFeeMapFromDefaults(transactions: { platforms: string | null }[]): Record<string, number> {
  // We need to load platform fees from localStorage on the client side,
  // but on the server we don't have access to localStorage.
  // Instead, we'll return enough data for the client to compute net income.
  // For now, just return 0 fees — the client will override.
  const names = new Set<string>()
  for (const t of transactions) {
    for (const p of parsePlatforms(t.platforms)) {
      names.add(p.name)
    }
  }
  const feeMap: Record<string, number> = {}
  for (const n of names) feeMap[n] = 0
  return feeMap
}

export async function GET() {
  try {
    const transactions = await db.transaction.findMany({
      orderBy: { date: 'desc' },
    })

    // We return raw data per month so the client can compute net income
    // using the actual feeMap from localStorage
    const monthMap = new Map<string, {
      month: number; year: number
      grossIncome: number; expense: number; count: number
      tax: number; platformFees: Record<string, { fee: number; reviewCount: number }>
    }>()

    for (const t of transactions) {
      const d = new Date(t.date)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      const existing = monthMap.get(key)

      const tax = (t.type === 'income' && t.taxRate) ? (t.taxRate / 100) * t.amount : 0
      const platforms = t.type === 'income' ? parsePlatforms(t.platforms) : []

      // Aggregate platform fees per month (name → total review count)
      const platformFees: Record<string, { fee: number; reviewCount: number }> = {}
      for (const p of platforms) {
        if (!platformFees[p.name]) platformFees[p.name] = { fee: 0, reviewCount: 0 }
        platformFees[p.name].reviewCount += p.reviewCount
      }

      if (existing) {
        if (t.type === 'income') existing.grossIncome += t.amount
        else existing.expense += t.amount
        existing.count++
        existing.tax += tax
        for (const [name, data] of Object.entries(platformFees)) {
          if (!existing.platformFees[name]) existing.platformFees[name] = { fee: 0, reviewCount: 0 }
          existing.platformFees[name].reviewCount += data.reviewCount
        }
      } else {
        monthMap.set(key, {
          month: d.getMonth() + 1,
          year: d.getFullYear(),
          grossIncome: t.type === 'income' ? t.amount : 0,
          expense: t.type === 'expense' ? t.amount : 0,
          count: 1,
          tax,
          platformFees,
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
