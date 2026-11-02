# Estação Motos — Mechanical Motion Experience

Filme vertical original de 60 segundos. Remotion 4.0.539, React 19, Three.js 0.180.0. Cenas editáveis individualmente no Studio.

## Usar

Com Node.js 22 ou superior instalado, execute nesta pasta:

```sh
npm ci
npm run studio
npm run check
npm run render
```

O filme está em `out/estacao-motos.mp4`, H.264 + AAC, 1080×1920, 30 fps. O animatic está em `out/animatic.mp4`.

Para abrir a sala de revisão: `node scripts/review-server.mjs` e abra http://localhost:3400.

## Editar

`src/Film.tsx`: timeline em segundos × fps. Cada cena possui arquivo próprio. `src/mechanics.tsx`: modelos geométricos procedurais; `src/design.tsx`: luz, curvas e tipografia; `scripts/audio.py`: trilha/efeitos originais e determinísticos (Python + NumPy). WAV já incluído; Python não é necessário para reproduzir/exportar o filme.

`public/screen-*.png`: capturas das interfaces originais com fixtures fictícias. O filme usa esses arquivos locais e não exige acesso ao servidor, Figma, internet ou banco de dados durante o render, após instalação e download inicial do Chromium.

`src/ui-entry.tsx` e `src/ProductScreens.tsx`: preparação opcional das capturas a partir do aplicativo irmão `../client`; exigem o repositório original completo. Não são dependências da composição final. Para recapturar: `npx remotion still src/ui-entry.tsx ScreenMoto public/screen-moto.png`, repetindo para ScreenOrders e ScreenHistory.

Identidade oficial preservada nos arquivos de logo fornecidos no repositório. Áudio sintetizado sem samples externos. Não foram contratados serviços de geração paga.

Limitações e verificações reais estão em `QA.md`. Direção e storyboard em `PROJETO.md`.
