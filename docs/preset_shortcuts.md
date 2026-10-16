# Favorite presets and shortcuts

Users can mark presets as favorites. Each favorite has a number shortcut.

## Using it

- **Add or remove a favorite:** click the star in the inspector's preset header. Right-click it to open the preferences.
- **Use a shortcut:** type its number on the map.
  - Nothing selected: starts drawing a feature with that preset.
  - Features selected: changes their preset.
  - Multi-digit shortcuts are typed in quick succession.
- **Favorites in the preset list:** a "Favorites" category is shown at the top when not searching.
- **Manage favorites:** Preferences pane → "Favorite Presets & Shortcuts".
  - Change a shortcut by typing a new number.
  - Taking a number that another favorite uses swaps the two numbers.
  - Drag rows to change the order. This does not change the shortcuts.

## Shortcut rules

- Numbers only, 1 to 3 digits, no leading zeros.
- `1`, `2`, `3` are reserved for the point, line and area draw modes.
- A new favorite gets the first free number, left-hand digits first:
  `4`, `5`, `11` … `55`, then the other one and two digit numbers, then three digits.
- Once assigned, a shortcut stays fixed until the user changes it.

## Code

| File | Purpose |
|---|---|
| `modules/core/preset_favorites.ts` | Store: favorites, shortcuts, assignment, `change` event |
| `modules/behavior/preset_favorites.ts` | Keyboard handling for number shortcuts |
| `modules/ui/favorite_button.ts` | Star button in the inspector header |
| `modules/ui/sections/favorite_presets*.ts` | Preferences section |
| `modules/ui/sections/favorites_category_item.ts` | "Favorites" category in the preset list |

Favorites are stored in local preferences under `preset-favorites` as a JSON list of `{ presetId, shortcut }`.
The older `preset_favorites` format (`{ [shortcut]: presetId }`) is migrated on first load.
