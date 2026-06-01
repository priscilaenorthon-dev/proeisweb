interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export async function resolverCaptcha(imagemBase64: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  const resposta = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: imagemBase64,
                },
              },
              {
                text: 'Esta imagem contém um CAPTCHA com letras e números. Retorne APENAS os caracteres do CAPTCHA, sem espaços, sem explicação, somente o texto.',
              },
            ],
          },
        ],
      }),
    },
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Gemini API ${resposta.status}: ${corpo}`);
  }

  const dados = (await resposta.json()) as GeminiResponse;
  const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!texto) throw new Error('Gemini não retornou texto para o CAPTCHA');
  return texto;
}
