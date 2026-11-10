# i18n messages

`locales/en.json` and `locales/fa.json` are the only message sources. Both files must contain
exactly the same keys; `tests/unit/i18n/messages.test.ts` fails on any difference, on empty
values, and on a `t('…')` call in `app/` whose key is missing. There is no cross-language
fallback (`fallbackLocale: false`): a missing key renders the key, never the other language.

## Feature message files

A removable feature keeps its strings in `locales/<feature>.en.json` and `locales/<feature>.fa.json` (for
example `demo-ticket.en.json`), written with the full key paths (`admin.nav.items.demoTickets`). They are merged
over `en.json` / `fa.json` when the app loads (`localeFiles` in `nuxt.config.ts`) and by the tests
(`tests/unit/support/locale-messages.ts`), so the same-keys rule above holds for the merged result. JSON cannot
hold the `demo-ticket:start` / `demo-ticket:end` markers, so deleting the pair is how the strings are removed.

## Key convention

`<area>.<element>.<property>`, every segment lowerCamelCase, nested objects (no dotted keys).

- `area`: the feature or shared surface that owns the string (`language`, `theme`, `error`,
  `auth`, `admin`, `landing`, …). Feature tickets add their own top-level area.
- `element`: the component or concept inside the area (`switch`, `options`, `notFound`).
- `property`: what the string is (`label`, `title`, `description`, `placeholder`, `cta`).
- Interpolation uses named tokens: `"Language: {name}"`. Never concatenate translated parts.
- Plurals use vue-i18n pipe syntax inside one key.
- Digits are formatted by the locale utilities, never typed into messages: `fa` shows Persian
  digits, `en` Western digits.
- Persian copy added by an agent is flagged `unapproved` in the catalog until the owner signs
  it off.
