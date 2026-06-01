import { NextResponse } from 'next/server';
import { loginECapturarServicos } from '@/lib/scraper';

export const maxDuration = 60;

async function executar(): Promise<NextResponse> {
  try {
    const resultado = await loginECapturarServicos();
    return NextResponse.json({
      success: true,
      totalEncontrados: resultado.totalEncontrados,
      totalInscritos: resultado.totalInscritos,
      timestamp: resultado.ultimaAtualizacao,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ success: false, error: mensagem }, { status: 500 });
  }
}

// GET: chamado pelo cron do Vercel (toda quinta-feira às 11h UTC)
export async function GET(): Promise<NextResponse> {
  return executar();
}

// POST: chamado pelo botão "Executar Agora" no dashboard
export async function POST(): Promise<NextResponse> {
  return executar();
}
