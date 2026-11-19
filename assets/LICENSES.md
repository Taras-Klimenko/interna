# Сторонние ассеты

| Что | Автор | Лицензия | Где в проекте |
|---|---|---|---|
| Universal Base Characters (Standard) | [Quaternius](https://quaternius.com/packs/universalbasecharacters.html) | CC0 1.0 | `apps/client/public/models/characters/body-*.glb`, `hair/*.glb` |
| Universal Animation Library (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0 | `apps/client/public/models/characters/animations-ual1.glb` |
| Universal Animation Library 2 (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary2.html) | CC0 1.0 | `apps/client/public/models/characters/animations-ual2.glb` |

Указывать авторство по CC0 не обязательно, но это вежливо.

## Как пересобрать

1. Положить архивы `[Standard].zip` в `assets/source/characters/`.
2. Распаковать каждый в свою папку: `_unpacked/base`, `_unpacked/ual1`, `_unpacked/ual2`.
3. `pnpm assets:characters`

Архивы и распакованные файлы в git не попадают (см. `.gitignore`), только собранные GLB.
