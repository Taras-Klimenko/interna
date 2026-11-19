# Сторонние ассеты

| Что | Автор | Лицензия | Где в проекте |
|---|---|---|---|
| Universal Base Characters (Standard) | [Quaternius](https://quaternius.com/packs/universalbasecharacters.html) | CC0 1.0 | `apps/client/public/models/characters/body-*.glb`, `hair/*.glb` |
| Universal Animation Library (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0 | `apps/client/public/models/characters/animations-ual1.glb` |
| Universal Animation Library 2 (Standard) | [Quaternius](https://quaternius.com/packs/universalanimationlibrary2.html) | CC0 1.0 | `apps/client/public/models/characters/animations-ual2.glb` |
| Ultimate House Interior Pack (June 2020) | [Quaternius](https://quaternius.com/packs/ultimatehomeinterior.html) | CC0 1.0 | `apps/client/public/models/furniture/*.glb` |

Указывать авторство по CC0 не обязательно, но это вежливо.

## Как пересобрать

Персонажи:

1. Положить архивы `[Standard].zip` в `assets/source/characters/`.
2. Распаковать каждый в свою папку: `_unpacked/base`, `_unpacked/ual1`, `_unpacked/ual2`.
3. `pnpm assets:characters`

Мебель:

1. Положить `Ultimate House Interior Pack - June 2020.zip` в `assets/source/furniture/`.
2. Распаковать из него папку `OBJ` в `assets/source/furniture/_unpacked/OBJ`.
3. `pnpm assets:furniture`. Скрипт пишет GLB в `apps/client/public/models/furniture/` и размеры в `apps/client/src/catalog/furniture.generated.json`.
   Какие модели брать, задаётся списком `MODELS` в `assets/scripts/build-furniture.mjs`.

Архивы и распакованные файлы в git не попадают (см. `.gitignore`), только собранные GLB.
