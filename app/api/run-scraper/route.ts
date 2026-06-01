import { NextResponse } from 'next/server';
import { loginECapturarServicos } from '@/lib/scraper';
import { log } from '@/lib/logger';
import type { LogLevel } from '@/lib/logger';

export const maxDuration = 60;

// GET: chamado pelo cron do Vercel (toda quinta-feira às 11h UTC)
export async function GET(): Promise<NextResponse> {
  try {
    const emit = (level: LogLevel, message: string) => log(level, message);
    const resultado = await loginECapturarServicos(emit);
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

// POST: chamado pelo botão "Executar Agora" — retorna SSE para logs em tempo real
export async function POST(): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(level: LogLevel, message: string) {
        const entry = { timestamp: new Date().toISOString(), level, message };
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
        } catch {
          // stream already closed
        }
      }

      try {
        const resultado = await loginECapturarServicos(emit);
        const done = {
          type: 'done',
          success: true,
          totalInscritos: resultado.totalInscritos,
          totalEncontrados: resultado.totalEncontrados,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : 'Erro desconhecido';
        const done = { type: 'done', success: false, error: mensagem };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
