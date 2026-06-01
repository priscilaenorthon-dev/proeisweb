import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

interface DadosServicos {
  ultimaAtualizacao: string | null;
  totalEncontrados: number;
  totalInscritos: number;
  servicos: unknown[];
}

function lerServicos(): DadosServicos {
  // Verifica /tmp primeiro (runtime do Vercel), depois o arquivo local
  const caminhos = ['/tmp/servicos.json', path.join(process.cwd(), 'data', 'servicos.json')];

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) {
      try {
        return JSON.parse(fs.readFileSync(caminho, 'utf-8')) as DadosServicos;
      } catch {
        /* tenta próximo */
      }
    }
  }

  return { ultimaAtualizacao: null, totalEncontrados: 0, totalInscritos: 0, servicos: [] };
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(lerServicos());
}
