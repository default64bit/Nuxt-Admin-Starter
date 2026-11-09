# i18n messages

`locales/en.json` and `locales/fa.json` are the only message sources. Both files must contain
exactly the same keys; `tests/unit/i18n/messages.test.ts` fails on any difference, on empty
values, and on a `t('…')` call in `app/` whose key is missing. There is no cross-language
fallback (`fallbackLocale: false`): a missing key renders the key, never the other language.

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
