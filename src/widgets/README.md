# Widgets

One folder per widget type:

| File | Role |
| --- | --- |
| `<type>/definition.ts` | Server-safe description: name and description keys, icon, library group, who can see it (`access`), settings tab, and **sizes** (`formats` = the only widths it can be resized to, `default`, `minPx`, `h`). |
| `<type>/view.tsx` | What it shows on a page. Receives `WidgetViewProps` (its instance and settings, edit mode, visibility, search…). |
| `definitions.ts` | The list of definitions (library order). Read by the catalogue, validation, access filtering, migration and resizing. |
| `views.ts` | The list of views, by type. Read by the page. |

A test checks that every definition has its folder, its view and a line in
`views.ts`, and that its sizes are valid.

## Adding a widget

1. Create `src/widgets/<type>/definition.ts` with `defineWidget({ … })`.
2. Create `src/widgets/<type>/view.tsx` exporting the component.
3. Add one line in `definitions.ts` and one in `views.ts`.
4. Add the name and description in `src/i18n/messages.ts` (English, French, Spanish, German and Italian).

It then appears in the widget library, can be placed, moved and resized in
its formats on every page, and follows the access rules of its definition.

## Changing the sizes of a widget

Edit the `sizes` line of its `definition.ts`. Widths already saved on pages
are kept until the widget is resized again.

## Data from integrations

Widgets showing machine metrics read the `Metric` values and vitals produced
by the integrations (`src/integrations/`), so a new monitoring source needs no
widget change. The Calme device widgets (Device, Fleet, Machines chart,
Storage) live in `devices/` and read `/api/devices/<id>/history` through one
shared store (`devices/deviceData.ts`); they draw with the chart kit in
`src/components/charts/`. Most views still delegate to the historical components in
`src/components/widgets/`; they move into their folder when redesigned.

Storage uses `storage/order.ts`: `settings.storageOrder` is `host` (default),
`usage` (global fullest first) or `manual`. Automatic modes disable card dragging.
`devices/order.ts` stores widget-local `settings.metricOrder` as serialized
`[deviceId, readingKey]` pairs (one-card measures use their semantic metric id,
disks and GPUs use their individual source keys). Unknown readings follow saved ones; absent
readings retain their slots. Figure/bar/ring cards use `SortableMetrics` in page
edit mode with mouse, touch and keyboard handles. The single-machine widget
sorts within each display group. Charts retain automatic order and host colours.
Widget settings follow page save/cancel/undo; shared machine order is unchanged.

Single-machine `settings.deviceGroupOrder` stores display-group ids (`ring`,
`value`, `bar`, `chart`). Named group handles move whole blocks while the nested
metric handles keep their original display. Charts include history/range controls
and move only as a block. Default layout is preserved until the first group move;
empty groups retain their saved slots. Group order follows page save/cancel/undo.
