# proeisweb

App estatico para auxiliar a primeira etapa de login no PROEIS.

O app nao resolve CAPTCHA, nao armazena credenciais e nao usa banco de dados.
Ele gera um bookmarklet para preencher o tipo de acesso "ID Funcional" e o
campo de login na pagina oficial.

## Rodar localmente

```bash
python -m http.server 3000
```

Acesse `http://localhost:3000`.

## Testes

```bash
npm test
```

## Vercel

Este projeto pode ser publicado como site estatico na Vercel. Nao ha etapa de
build obrigatoria.
