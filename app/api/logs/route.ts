import { NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getLogs());
}

export async function DELETE(): Promise<NextResponse> {
  clearLogs();
  return NextResponse.json({ ok: true });
}
